// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  getClaims: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  rateLimit: vi.fn(),
  chatMessagesForReport: vi.fn(),
  env: { CHAT_ENABLED: "true" as string },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getClaims: h.getClaims }, from: h.from })),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: h.rateLimit, getRateLimitHeaders: () => ({}) }));
vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/security", () => ({
  getClientIp: () => "1.2.3.4",
  sanitizeErrorMessage: (_e: unknown, f: string) => f,
  isSameOriginRequest: () => true,
}));
vi.mock("@/lib/plan", () => ({
  FREE_PLAN: { auditsPerMonth: 3, chatMessagesPerAudit: 5 },
  chatMessagesForReport: h.chatMessagesForReport,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "./route";

const REPORT_ID = "11111111-1111-4111-8111-111111111111";
const ok = (o = {}) => ({ success: true, remaining: 9, resetTime: Date.now() + 60_000, limit: 30, ...o });
const req = (body: unknown) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.env.CHAT_ENABLED = "true";
  h.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
  h.rateLimit.mockResolvedValue(ok());
  h.maybeSingle.mockResolvedValue({ data: { id: REPORT_ID, status: "done", result: null }, error: null });
  h.insert.mockResolvedValue({ error: null });
  h.chatMessagesForReport.mockResolvedValue(0);
  h.from.mockImplementation((table: string) => {
    if (table === "reports") return { select: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }) };
    if (table === "chat_messages") return { insert: h.insert };
    return {};
  });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ answer: "Here is the answer." }) })));
  process.env.N8N_CHAT_WEBHOOK_URL = "https://n8n.example/chat";
  process.env.SIS_WEBHOOK_SECRET = "x".repeat(16);
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/chat", () => {
  it("503 when chat is disabled via the kill-switch", async () => {
    h.env.CHAT_ENABLED = "false";
    expect((await POST(req({ reportId: REPORT_ID, message: "hi there" }))).status).toBe(503);
  });
  it("400 for an invalid body", async () => {
    expect((await POST(req({ reportId: "not-uuid", message: "" }))).status).toBe(400);
  });
  it("401 when unauthenticated", async () => {
    h.getClaims.mockResolvedValue({ data: { claims: null } });
    expect((await POST(req({ reportId: REPORT_ID, message: "hello there" }))).status).toBe(401);
  });
  it("429 when rate-limited", async () => {
    h.rateLimit.mockResolvedValue(ok({ success: false }));
    expect((await POST(req({ reportId: REPORT_ID, message: "hello there" }))).status).toBe(429);
  });
  it("404 when the report is not found / not owned", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await POST(req({ reportId: REPORT_ID, message: "hello there" }))).status).toBe(404);
  });
  it("409 when the report is not done yet", async () => {
    h.maybeSingle.mockResolvedValue({ data: { id: REPORT_ID, status: "crawling", result: null }, error: null });
    expect((await POST(req({ reportId: REPORT_ID, message: "hello there" }))).status).toBe(409);
  });
  it("429 when the per-audit chat quota is exhausted", async () => {
    h.chatMessagesForReport.mockResolvedValue(5);
    expect((await POST(req({ reportId: REPORT_ID, message: "hello there" }))).status).toBe(429);
  });
  it("502 when the n8n assistant fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    expect((await POST(req({ reportId: REPORT_ID, message: "hello there" }))).status).toBe(502);
  });
  it("200 with the answer on success and persists the turn", async () => {
    const res = await POST(req({ reportId: REPORT_ID, message: "hello there" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: "Here is the answer." });
    expect(h.insert).toHaveBeenCalledOnce();
  });
});
