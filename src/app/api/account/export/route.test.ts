// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ getClaims: vi.fn(), from: vi.fn(), rateLimit: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getClaims: h.getClaims }, from: h.from })) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: h.rateLimit, getRateLimitHeaders: () => ({}) }));

import { GET } from "./route";

const ok = (o = {}) => ({ success: true, remaining: 4, resetTime: Date.now() + 60_000, limit: 5, ...o });

beforeEach(() => {
  vi.clearAllMocks();
  h.getClaims.mockResolvedValue({ data: { claims: { sub: "u1", email: "u@x.com" } } });
  h.rateLimit.mockResolvedValue(ok());
  h.from.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: "r1" }] }) });
});

describe("GET /api/account/export", () => {
  it("401 when unauthenticated", async () => {
    h.getClaims.mockResolvedValue({ data: { claims: null } });
    expect((await GET()).status).toBe(401);
  });
  it("429 when rate-limited", async () => {
    h.rateLimit.mockResolvedValue(ok({ success: false }));
    expect((await GET()).status).toBe(429);
  });
  it("200 returns the caller's data as a downloadable JSON payload", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("site-iq-export.json");
    const body = await res.json();
    expect(body.account).toEqual({ id: "u1", email: "u@x.com" });
    expect(Array.isArray(body.reports)).toBe(true);
    expect(body).toHaveProperty("chatMessages");
    expect(body).toHaveProperty("auditUsage");
  });
});
