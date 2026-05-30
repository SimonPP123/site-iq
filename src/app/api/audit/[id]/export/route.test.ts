// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ getClaims: vi.fn(), rateLimit: vi.fn(), single: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: h.getClaims },
    from: () => ({ select: () => ({ eq: () => ({ single: h.single }) }) }),
  })),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: h.rateLimit, getRateLimitHeaders: () => ({}) }));

import { GET } from "./route";

const UUID = "00000000-0000-0000-0000-000000000001";
const result = { overall: 80, grade: "B", capped: false, dimensions: [], actionPlan: [] };
const doneReport = { domain: "example.com", status: "done", result };

const callGET = (id = UUID, qs = "") =>
  GET(new Request(`http://localhost/api/audit/${id}/export${qs}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } } });
  h.rateLimit.mockResolvedValue({ success: true });
  h.single.mockResolvedValue({ data: doneReport });
});

describe("GET /api/audit/[id]/export", () => {
  it("401 when unauthenticated", async () => {
    h.getClaims.mockResolvedValue({ data: { claims: null } });
    expect((await callGET()).status).toBe(401);
  });

  it("404 for a malformed (non-UUID) id - never hits the DB", async () => {
    const res = await callGET("not-a-uuid");
    expect(res.status).toBe(404);
    expect(h.single).not.toHaveBeenCalled();
  });

  it("429 when rate-limited", async () => {
    h.rateLimit.mockResolvedValue({ success: false });
    expect((await callGET()).status).toBe(429);
  });

  it("404 when the report is not found / not owned (RLS-scoped query returns nothing)", async () => {
    h.single.mockResolvedValue({ data: null });
    expect((await callGET()).status).toBe(404);
  });

  it("409 when the report is not done yet", async () => {
    h.single.mockResolvedValue({ data: { domain: "example.com", status: "running", result: null } });
    expect((await callGET()).status).toBe(409);
  });

  it("200 Markdown by default with an attachment filename", async () => {
    const res = await callGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("site-iq-example.com.md");
    expect(await res.text()).toContain("# Site IQ audit - example.com");
  });

  it("200 JSON when ?format=json", async () => {
    const res = await callGET(UUID, "?format=json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain(".json");
    expect(JSON.parse(await res.text()).domain).toBe("example.com");
  });
});
