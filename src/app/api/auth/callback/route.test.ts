// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ exchange: vi.fn(), rateLimit: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { exchangeCodeForSession: h.exchange } })),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: h.rateLimit }));
vi.mock("@/lib/security", () => ({ getClientIp: () => "1.2.3.4" }));
// validateRedirect is the real (pure, security-relevant) implementation - intentionally NOT mocked.

import { GET } from "./route";

const ok = (o = {}) => ({ success: true, remaining: 9, resetTime: Date.now() + 60_000, limit: 10, ...o });
const reqUrl = (qs: string) =>
  new Request("http://localhost/api/auth/callback" + qs) as unknown as Parameters<typeof GET>[0];

beforeEach(() => {
  vi.clearAllMocks();
  h.rateLimit.mockResolvedValue(ok());
  h.exchange.mockResolvedValue({ error: null });
});

describe("GET /api/auth/callback", () => {
  it("redirects to /login?error=rate_limit when rate-limited", async () => {
    h.rateLimit.mockResolvedValue(ok({ success: false }));
    const res = await GET(reqUrl("?code=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?error=rate_limit");
  });
  it("redirects to /login?error=auth when the code exchange fails", async () => {
    h.exchange.mockResolvedValue({ error: { message: "bad code" } });
    const res = await GET(reqUrl("?code=bad"));
    expect(res.headers.get("location")).toContain("/login?error=auth");
  });
  it("redirects to the validated next target on success", async () => {
    const res = await GET(reqUrl("?code=ok&next=/account"));
    expect(res.headers.get("location")).toContain("/account");
  });
  it("falls back to /audits for an open-redirect next target", async () => {
    const res = await GET(reqUrl("?code=ok&next=https://evil.example"));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/audits");
    expect(loc).not.toContain("evil.example");
  });
  it("redirects to the default when there is no code", async () => {
    const res = await GET(reqUrl(""));
    expect(res.headers.get("location")).toContain("/audits");
  });
});
