// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({ getClaims: vi.fn(), rateLimit: vi.fn(), isAdminEmail: vi.fn(), send: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getClaims: h.getClaims } })) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: h.rateLimit, getRateLimitHeaders: () => ({}) }));
vi.mock("@/lib/security", () => ({ getClientIp: () => "1.2.3.4", sanitizeErrorMessage: (_e: unknown, f: string) => f }));
vi.mock("@/lib/admin", () => ({ isAdminEmail: h.isAdminEmail }));
vi.mock("resend", () => ({ Resend: class { emails = { send: h.send }; } }));

import { POST } from "./route";

const ok = (o = {}) => ({ success: true, remaining: 9, resetTime: Date.now() + 60_000, limit: 10, ...o });
const body = { to: "x@example.com", subject: "Hi", html: "<p>Hi</p>" };
const req = (b: unknown) =>
  new Request("http://localhost/api/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(b),
  }) as unknown as Parameters<typeof POST>[0];

beforeEach(() => {
  vi.clearAllMocks();
  h.getClaims.mockResolvedValue({ data: { claims: { sub: "u1", email: "admin@site.iq" } } });
  h.rateLimit.mockResolvedValue(ok());
  h.isAdminEmail.mockReturnValue(true);
  h.send.mockResolvedValue({ data: { id: "email-1" }, error: null });
  process.env.RESEND_API_KEY = "re_test";
});
afterEach(() => {
  delete process.env.RESEND_API_KEY;
});

describe("POST /api/email", () => {
  it("401 when unauthenticated", async () => {
    h.getClaims.mockResolvedValue({ data: { claims: null } });
    expect((await POST(req(body))).status).toBe(401);
  });
  it("403 for a non-admin (open-relay guard)", async () => {
    h.isAdminEmail.mockReturnValue(false);
    expect((await POST(req(body))).status).toBe(403);
  });
  it("429 when rate-limited", async () => {
    h.rateLimit.mockResolvedValue(ok({ success: false }));
    expect((await POST(req(body))).status).toBe(429);
  });
  it("503 when the email service is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    expect((await POST(req(body))).status).toBe(503);
  });
  it("400 for an invalid body", async () => {
    expect((await POST(req({ to: "bad", subject: "", html: "" }))).status).toBe(400);
  });
  it("200 on success", async () => {
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(h.send).toHaveBeenCalledOnce();
  });
});
