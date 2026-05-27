// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ getClaims: vi.fn(), from: vi.fn(), rateLimit: vi.fn(), docDelete: vi.fn(), repSelect: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getClaims: h.getClaims }, from: h.from })),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: h.rateLimit, getRateLimitHeaders: () => ({}) }));
vi.mock("@/lib/security", () => ({ sanitizeErrorMessage: (_e: unknown, f: string) => f }));

import { POST } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ok = (o = {}) => ({ success: true, remaining: 19, resetTime: Date.now() + 60_000, limit: 20, ...o });
const req = (body: unknown) =>
  new Request("http://localhost/api/reports/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
  h.rateLimit.mockResolvedValue(ok());
  h.docDelete.mockReturnValue({ filter: vi.fn().mockResolvedValue({ error: null }) });
  h.repSelect.mockResolvedValue({ data: [{ id: ID }], error: null });
  h.from.mockImplementation((table: string) => {
    if (table === "documents") return { delete: h.docDelete };
    if (table === "reports") return { delete: () => ({ in: () => ({ select: h.repSelect }) }) };
    return {};
  });
});

describe("POST /api/reports/delete", () => {
  it("400 for an empty/invalid id list", async () => {
    expect((await POST(req({ ids: [] }))).status).toBe(400);
  });
  it("401 when unauthenticated", async () => {
    h.getClaims.mockResolvedValue({ data: { claims: null } });
    expect((await POST(req({ ids: [ID] }))).status).toBe(401);
  });
  it("429 when rate-limited", async () => {
    h.rateLimit.mockResolvedValue(ok({ success: false }));
    expect((await POST(req({ ids: [ID] }))).status).toBe(429);
  });
  it("200 with the deleted count on success", async () => {
    const res = await POST(req({ ids: [ID] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 1 });
  });
  it("500 when a delete fails", async () => {
    h.docDelete.mockReturnValue({ filter: vi.fn().mockResolvedValue({ error: { message: "db" } }) });
    expect((await POST(req({ ids: [ID] }))).status).toBe(500);
  });
});
