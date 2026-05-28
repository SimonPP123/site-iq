// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoisted mock state so the vi.mock factories (hoisted above imports) can reference it.
const h = vi.hoisted(() => ({
  getClaims: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  serviceFrom: vi.fn(),
  serviceRpc: vi.fn(),
  rateLimit: vi.fn(),
  peekRateLimit: vi.fn(),
  normalizeDomain: vi.fn(),
  isPrivateIp: vi.fn(),
  lookup: vi.fn(),
  env: { AUDITS_ENABLED: "true" as string, GLOBAL_DAILY_AUDIT_CAP: undefined as number | undefined },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getClaims: h.getClaims }, rpc: h.rpc, from: h.from })),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: h.serviceFrom, rpc: h.serviceRpc }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: h.rateLimit, peekRateLimit: h.peekRateLimit, getRateLimitHeaders: () => ({}) }));
vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/domain", () => ({ normalizeDomain: h.normalizeDomain }));
vi.mock("@/lib/ssrf", () => ({ isPrivateIp: h.isPrivateIp }));
vi.mock("@/lib/security", () => ({
  getClientIp: () => "1.2.3.4",
  sanitizeErrorMessage: (_e: unknown, fallback: string) => fallback,
  isSameOriginRequest: () => true,
}));
vi.mock("@/lib/plan", () => ({ FREE_PLAN: { auditsPerMonth: 3, chatMessagesPerAudit: 5 } }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("node:dns", () => ({ promises: { lookup: h.lookup } }));

import { POST } from "./route";

const ok = (over?: Partial<{ success: boolean }>) => ({
  success: true,
  remaining: 9,
  resetTime: Date.now() + 60_000,
  limit: 10,
  ...over,
});

function req(body: unknown) {
  return new Request("http://localhost/api/audit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.env.AUDITS_ENABLED = "true";
  h.env.GLOBAL_DAILY_AUDIT_CAP = undefined;
  h.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
  h.rateLimit.mockResolvedValue(ok());
  h.peekRateLimit.mockResolvedValue(0);
  h.normalizeDomain.mockReturnValue({ ok: true, domain: "example.com", rootUrl: "https://example.com" });
  h.isPrivateIp.mockReturnValue(false);
  h.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  h.rpc.mockResolvedValue({ data: 1, error: null });
  const single = vi.fn().mockResolvedValue({ data: { id: "report-1" }, error: null });
  h.from.mockReturnValue({ insert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })) });
  h.serviceFrom.mockReturnValue({ update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) });
  h.serviceRpc.mockResolvedValue({ error: null });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 202 })));
  process.env.N8N_AUDIT_WEBHOOK_URL = "https://n8n.example/webhook";
  process.env.SIS_WEBHOOK_SECRET = "x".repeat(16);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/audit", () => {
  it("returns 503 when audits are disabled via the kill-switch", async () => {
    h.env.AUDITS_ENABLED = "false";
    const res = await POST(req({ domain: "example.com" }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for an invalid body", async () => {
    const res = await POST(req({ nope: true }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    h.getClaims.mockResolvedValue({ data: { claims: null } });
    const res = await POST(req({ domain: "example.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    h.rateLimit.mockResolvedValue(ok({ success: false }));
    const res = await POST(req({ domain: "example.com" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for an invalid/unnormalizable domain", async () => {
    h.normalizeDomain.mockReturnValue({ ok: false, error: "bad domain" });
    const res = await POST(req({ domain: "@@@" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the domain does not resolve (NXDOMAIN)", async () => {
    h.lookup.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const res = await POST(req({ domain: "does-not-exist.example" }));
    expect(res.status).toBe(400);
  });

  it("proceeds when DNS times out (fail-open) and still reaches 202", async () => {
    h.lookup.mockRejectedValue(new Error("dns-timeout"));
    const res = await POST(req({ domain: "slow-dns.example" }));
    expect(res.status).toBe(202);
  });

  it("returns 400 when the domain resolves to a private IP (SSRF guard)", async () => {
    h.isPrivateIp.mockReturnValue(true);
    const res = await POST(req({ domain: "evil.example" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when the global daily cap is exhausted", async () => {
    h.env.GLOBAL_DAILY_AUDIT_CAP = 100;
    h.peekRateLimit.mockResolvedValue(100); // already at the cap
    const res = await POST(req({ domain: "example.com" }));
    expect(res.status).toBe(503);
  });

  it("fails closed (503) when the global counter is unreachable", async () => {
    h.env.GLOBAL_DAILY_AUDIT_CAP = 100;
    h.peekRateLimit.mockResolvedValue(null); // shared Postgres counter down
    const res = await POST(req({ domain: "example.com" }));
    expect(res.status).toBe(503);
  });

  it("consumes a global slot only after the audit starts", async () => {
    h.env.GLOBAL_DAILY_AUDIT_CAP = 100;
    h.peekRateLimit.mockResolvedValue(5); // under cap
    const res = await POST(req({ domain: "example.com" }));
    expect(res.status).toBe(202);
    expect(h.rateLimit).toHaveBeenCalledWith("global:audits", 100, 86_400_000, true);
  });

  it("does not consume a global slot when the n8n trigger fails", async () => {
    h.env.GLOBAL_DAILY_AUDIT_CAP = 100;
    h.peekRateLimit.mockResolvedValue(5);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    const res = await POST(req({ domain: "example.com" }));
    expect(res.status).toBe(502);
    // Precise matcher: production ALWAYS calls the global consume with 4 args (trailing failClosed).
    // A 3-arg not.toHaveBeenCalledWith is satisfied by any 4-arg call and so can never catch the
    // regression it exists for. Assert against the exact 4-arg shape, and that the consume count is 0.
    expect(h.rateLimit).not.toHaveBeenCalledWith("global:audits", 100, 86_400_000, true);
    expect(h.rateLimit.mock.calls.filter((c) => c[0] === "global:audits").length).toBe(0);
  });

  it("returns 429 when the monthly free quota is exhausted (-1)", async () => {
    h.rpc.mockResolvedValue({ data: -1, error: null });
    const res = await POST(req({ domain: "example.com" }));
    expect(res.status).toBe(429);
  });

  it("returns 202 with the reportId on success and triggers n8n", async () => {
    const res = await POST(req({ domain: "example.com" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ reportId: "report-1" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("returns 502 and marks the report errored when the n8n trigger fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    h.serviceFrom.mockReturnValue({ update });
    const res = await POST(req({ domain: "example.com" }));
    expect(res.status).toBe(502);
    expect(update).toHaveBeenCalledWith({ status: "error", error: expect.any(String) });
  });

  it("refunds the consumed credit when the report insert fails (no silent charge)", async () => {
    // consume_audit_credit ran BEFORE the insert; if the insert fails there is no report row for the
    // status->error refund trigger to fire on, so the route must refund directly via service-role.
    // This compensating transaction was previously untested - a drift in the RPC name / period key
    // would silently eat one of the user's 3 monthly free credits.
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "insert boom" } });
    h.from.mockReturnValue({ insert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })) });
    const res = await POST(req({ domain: "example.com" }));
    expect(res.status).toBe(500);
    expect(h.serviceRpc).toHaveBeenCalledWith(
      "refund_audit_credit",
      expect.objectContaining({ p_user: "user-1", p_period: expect.stringMatching(/^\d{4}-\d{2}$/) }),
    );
  });
});
