/**
 * Unit tests for the rate limiter. Covers the production Postgres path (mocked RPC), the graceful
 * in-memory fallback when the backend is unavailable, the in-memory limiter itself (window reset +
 * isolation + edge cases), and the response headers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the service client + Sentry so the Postgres path is fully controllable in tests.
const rpcMock = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: rpcMock }),
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

import { rateLimit, getRateLimitHeaders, peekRateLimit } from "./rate-limit";

describe("getRateLimitHeaders", () => {
  it("omits Retry-After when the request is allowed", () => {
    const headers = getRateLimitHeaders({ success: true, remaining: 5, resetTime: 1700000000000, limit: 10 });
    expect(headers["X-RateLimit-Limit"]).toBe("10");
    expect(headers["X-RateLimit-Remaining"]).toBe("5");
    expect(headers["X-RateLimit-Reset"]).toBe("1700000000");
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("rounds the reset time up from ms to seconds", () => {
    const headers = getRateLimitHeaders({ success: true, remaining: 9, resetTime: 1700000000500, limit: 10 });
    expect(headers["X-RateLimit-Reset"]).toBe("1700000001");
  });

  it("includes a positive Retry-After for a blocked request", () => {
    const now = 1700000000000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const headers = getRateLimitHeaders({ success: false, remaining: 0, resetTime: now + 30_000, limit: 10 });
    expect(headers["Retry-After"]).toBe("30");
    vi.useRealTimers();
  });
});

describe("rateLimit - Postgres backend (production path)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    process.env.FORCE_PG_RATE_LIMIT = "1";
  });
  afterEach(() => {
    delete process.env.FORCE_PG_RATE_LIMIT;
  });

  it("allows when the RPC reports allowed and forwards the bucket params", async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: true, remaining: 4, reset_ms: 12_000 }], error: null });
    const r = await rateLimit("audit:u1", 5, 60_000);
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(4);
    expect(rpcMock).toHaveBeenCalledWith("check_rate_limit", { p_key: "audit:u1", p_limit: 5, p_window_ms: 60_000 });
  });

  it("blocks when the RPC reports not allowed", async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: false, remaining: 0, reset_ms: 5_000 }], error: null });
    const r = await rateLimit("audit:u1", 5, 60_000);
    expect(r.success).toBe(false);
  });

  it("falls back to in-memory (never a hard failure) when the RPC errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "function check_rate_limit does not exist" } });
    const r = await rateLimit("pg-fallback:" + Math.random(), 3, 60_000);
    expect(r.success).toBe(true);
    expect(r.limit).toBe(3);
  });
});

describe("rateLimit - in-memory limiter (development path)", () => {
  beforeEach(() => {
    delete process.env.FORCE_PG_RATE_LIMIT;
    vi.useFakeTimers();
    // Safety: if NODE_ENV is "production" in this env, force the PG path to degrade to in-memory.
    rpcMock.mockResolvedValue({ data: null, error: { message: "forced fallback" } });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request and decrements remaining", async () => {
    const id = "mem-decrement";
    expect((await rateLimit(id, 10, 60_000)).remaining).toBe(9);
    expect((await rateLimit(id, 10, 60_000)).remaining).toBe(8);
    expect((await rateLimit(id, 10, 60_000)).remaining).toBe(7);
  });

  it("blocks after the limit is reached, then resets after the window", async () => {
    const id = "mem-window";
    for (let i = 0; i < 10; i++) expect((await rateLimit(id, 10, 60_000)).success).toBe(true);
    expect((await rateLimit(id, 10, 60_000)).success).toBe(false);
    vi.advanceTimersByTime(60_001);
    const after = await rateLimit(id, 10, 60_000);
    expect(after.success).toBe(true);
    expect(after.remaining).toBe(9);
  });

  it("tracks identifiers independently", async () => {
    for (let i = 0; i < 5; i++) await rateLimit("mem-a", 5, 60_000);
    expect((await rateLimit("mem-a", 5, 60_000)).success).toBe(false);
    expect((await rateLimit("mem-b", 5, 60_000)).success).toBe(true);
  });

  it("handles a limit of 1", async () => {
    const id = "mem-limit-1";
    expect((await rateLimit(id, 1, 60_000)).success).toBe(true);
    expect((await rateLimit(id, 1, 60_000)).success).toBe(false);
  });
});

describe("peekRateLimit + fail-closed (cost-critical gate)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    process.env.FORCE_PG_RATE_LIMIT = "1";
  });
  afterEach(() => {
    delete process.env.FORCE_PG_RATE_LIMIT;
  });

  it("returns the current count and forwards the bucket params (read-only, no consume)", async () => {
    rpcMock.mockResolvedValue({ data: 42, error: null });
    const n = await peekRateLimit("global:audits", 86_400_000);
    expect(n).toBe(42);
    expect(rpcMock).toHaveBeenCalledWith("peek_rate_limit", { p_key: "global:audits", p_window_ms: 86_400_000 });
  });

  it("returns null when the RPC errors, so the caller fails CLOSED (cost ceiling cannot silently vanish)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "peek_rate_limit unavailable" } });
    expect(await peekRateLimit("global:audits", 86_400_000)).toBeNull();
  });

  it("rateLimit(failClosed=true) returns success:false when the shared backend is down", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "backend down" } });
    const r = await rateLimit("global:audits", 5000, 86_400_000, true);
    expect(r.success).toBe(false);
  });
});
