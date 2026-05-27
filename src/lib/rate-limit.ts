/**
 * Rate limiter.
 *
 * Production uses a Postgres-backed fixed-window counter shared across ALL serverless instances
 * (the `check_rate_limit` RPC, migration 0014), called via the service-role client. Development
 * uses an in-memory map. If the Postgres backend is unreachable we fall back to in-memory AND
 * report it to Sentry once, so a degraded limiter is never silent.
 *
 * This is burst control, not the sole cost ceiling: spend is independently capped by the
 * per-account monthly quota (consume_audit_credit) and the global daily audit cap, so a transient
 * limiter blip can never run up an unbounded bill.
 */
import { createServiceClient } from "@/lib/supabase/service";
import * as Sentry from "@sentry/nextjs";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// --- In-memory limiter (development + degraded fallback) ---
const rateLimitMap = new Map<string, RateLimitRecord>();
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) rateLimitMap.delete(key);
  }
}

function inMemoryRateLimit(identifier: string, limit: number, windowMs: number): RateLimitResult {
  cleanup();
  const now = Date.now();
  const record = rateLimitMap.get(identifier);
  if (!record || now > record.resetTime) {
    const resetTime = now + windowMs;
    rateLimitMap.set(identifier, { count: 1, resetTime });
    return { success: true, remaining: limit - 1, resetTime, limit };
  }
  if (record.count >= limit) {
    return { success: false, remaining: 0, resetTime: record.resetTime, limit };
  }
  record.count += 1;
  return { success: true, remaining: limit - record.count, resetTime: record.resetTime, limit };
}

// --- Postgres-backed limiter (production; shared across instances) ---
let warnedNoBackend = false;

async function postgresRateLimit(
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  const admin = createServiceClient();
  if (!admin) return null; // no service key (dev) -> caller uses in-memory

  const { data, error } = await admin.rpc("check_rate_limit", {
    p_key: identifier,
    p_limit: limit,
    p_window_ms: windowMs,
  });

  if (error) {
    // RPC missing (migration not yet applied) or a transient DB error: degrade to in-memory, but
    // surface it once so the degradation is visible (the quota layer still caps spend regardless).
    if (!warnedNoBackend) {
      warnedNoBackend = true;
      console.error("[rate-limit] postgres backend unavailable, using in-memory fallback:", error.message);
      Sentry.captureMessage(`rate-limit postgres backend unavailable: ${error.message}`, "warning");
    }
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    success: Boolean(row.allowed),
    remaining: Number(row.remaining ?? 0),
    resetTime: Date.now() + Number(row.reset_ms ?? windowMs),
    limit,
  };
}

// --- Public API ---
function usesServerBackend(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.FORCE_PG_RATE_LIMIT);
}

/**
 * Check whether a request is within its rate-limit budget.
 * @param identifier unique bucket key (e.g. `audit:${userId}` or `audit-ip:${ip}`)
 * @param limit max requests allowed per window
 * @param windowMs window length in milliseconds
 */
export async function rateLimit(
  identifier: string,
  limit = 10,
  windowMs = 60_000,
  failClosed = false,
): Promise<RateLimitResult> {
  if (usesServerBackend()) {
    const pg = await postgresRateLimit(identifier, limit, windowMs);
    if (pg) return pg;
    // Backend unreachable. For cost-critical buckets (the global daily cap) fail CLOSED rather than
    // fall back to per-instance memory - an in-memory "global" ceiling would multiply across serverless
    // instances and reset on cold start, defeating the cap. Burst limiters stay fail-open (default).
    if (failClosed) {
      return { success: false, remaining: 0, resetTime: Date.now() + windowMs, limit };
    }
  }
  return inMemoryRateLimit(identifier, limit, windowMs);
}

/**
 * Read the current count for a bucket WITHOUT consuming a slot, so a cost ceiling can be GATED on the
 * way in and the slot consumed (via rateLimit) only once the work actually starts - rejected or failed
 * attempts then never erode the ceiling. Returns the current count, or null when the shared Postgres
 * backend is unavailable so the caller can fail CLOSED for a cost-critical cap. Returns 0 in dev (the
 * global cap is a production concern; there is no shared counter to read).
 */
export async function peekRateLimit(identifier: string, windowMs: number): Promise<number | null> {
  if (!usesServerBackend()) return 0;
  const admin = createServiceClient();
  if (!admin) return 0;
  const { data, error } = await admin.rpc("peek_rate_limit", {
    p_key: identifier,
    p_window_ms: windowMs,
  });
  if (error) {
    if (!warnedNoBackend) {
      warnedNoBackend = true;
      console.error("[rate-limit] postgres peek unavailable:", error.message);
      Sentry.captureMessage(`rate-limit peek backend unavailable: ${error.message}`, "warning");
    }
    return null;
  }
  return Number(data ?? 0);
}

/** Standard rate-limit response headers. `Retry-After` is set only when the request was limited. */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetTime / 1000)),
  };
  if (!result.success) {
    headers["Retry-After"] = String(Math.max(0, Math.ceil((result.resetTime - Date.now()) / 1000)));
  }
  return headers;
}
