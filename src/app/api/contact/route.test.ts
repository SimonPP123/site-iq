// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn(), rateLimit: vi.fn(), sendEmail: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from: h.from })) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: h.rateLimit, getRateLimitHeaders: () => ({}) }));
vi.mock("@/lib/security", () => ({
  getClientIp: () => "1.2.3.4",
  sanitizeErrorMessage: (_e: unknown, f: string) => f,
}));
vi.mock("@/lib/email", () => ({ sendEmail: h.sendEmail }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "./route";

const valid = { name: "Jane Doe", email: "jane@acme.co", message: "I would like to learn more about Site IQ, please." };
const ok = (o = {}) => ({ success: true, remaining: 4, resetTime: Date.now() + 60_000, limit: 5, ...o });
const req = (body: unknown) =>
  new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.rateLimit.mockResolvedValue(ok());
  h.insert.mockResolvedValue({ error: null });
  h.from.mockReturnValue({ insert: h.insert });
  h.sendEmail.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  delete process.env.N8N_CONTACT_WEBHOOK_URL;
  delete process.env.CONTACT_EMAIL;
  process.env.SIS_WEBHOOK_SECRET = "x".repeat(16);
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/contact", () => {
  it("429 when rate-limited", async () => {
    h.rateLimit.mockResolvedValue(ok({ success: false }));
    expect((await POST(req(valid))).status).toBe(429);
  });
  it("400 for an invalid body", async () => {
    expect((await POST(req({ name: "x", email: "bad", message: "short" }))).status).toBe(400);
  });
  it("400 for a disposable email address", async () => {
    expect((await POST(req({ ...valid, email: "throwaway@mailinator.com" }))).status).toBe(400);
  });
  it("500 when the insert fails", async () => {
    h.insert.mockResolvedValue({ error: { message: "db" } });
    expect((await POST(req(valid))).status).toBe(500);
  });
  it("200 and notifies the team via n8n when configured", async () => {
    process.env.N8N_CONTACT_WEBHOOK_URL = "https://n8n.example/contact";
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("200 and falls back to email when n8n is not configured", async () => {
    process.env.CONTACT_EMAIL = "team@example.com";
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(h.sendEmail).toHaveBeenCalledOnce();
  });
});
