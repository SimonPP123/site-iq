// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  getClaims: vi.fn(),
  from: vi.fn(),
  rateLimit: vi.fn(),
  serviceClient: vi.fn(),
  serviceFrom: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getClaims: h.getClaims }, from: h.from })) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: h.serviceClient }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: h.rateLimit, getRateLimitHeaders: () => ({}) }));
vi.mock("@/lib/security", () => ({ sanitizeErrorMessage: (_e: unknown, f: string) => f, isSameOriginRequest: () => true }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "./route";

const ok = (o = {}) => ({ success: true, remaining: 2, resetTime: Date.now() + 60_000, limit: 3, ...o });
// Same-origin POST Request (isSameOriginRequest is mocked to true; this just satisfies the signature).
const req = () => new Request("https://siteiq.monkata.ai/api/account/delete", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  h.getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } } });
  h.rateLimit.mockResolvedValue(ok());
  h.from.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: "r1" }, { id: "r2" }] }) });
  h.serviceFrom.mockReturnValue({ delete: () => ({ filter: vi.fn().mockResolvedValue({ error: null }) }) });
  h.deleteUser.mockResolvedValue({ error: null });
  h.serviceClient.mockReturnValue({ from: h.serviceFrom, auth: { admin: { deleteUser: h.deleteUser } } });
});

describe("POST /api/account/delete", () => {
  it("401 when unauthenticated", async () => {
    h.getClaims.mockResolvedValue({ data: { claims: null } });
    expect((await POST(req())).status).toBe(401);
  });
  it("429 when rate-limited", async () => {
    h.rateLimit.mockResolvedValue(ok({ success: false }));
    expect((await POST(req())).status).toBe(429);
  });
  it("503 when the service client is unavailable", async () => {
    h.serviceClient.mockReturnValue(null);
    expect((await POST(req())).status).toBe(503);
  });
  it("200 deletes the auth user (cascade) after purging documents", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(h.deleteUser).toHaveBeenCalledWith("u1");
  });
  it("500 when the auth-user delete fails", async () => {
    h.deleteUser.mockResolvedValue({ error: { message: "boom" } });
    expect((await POST(req())).status).toBe(500);
  });
});
