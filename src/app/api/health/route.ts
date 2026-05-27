import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health endpoint.
 *
 * - Default (liveness): cheap, dependency-free - "the app is serving". For load balancers / quick pings.
 * - `?ready=1` (readiness): verifies the critical dependency (Supabase) actually responds, returning
 *   503 when it does not, so an uptime monitor can page a human on a real outage (not just a crash).
 *   n8n is reported as configured (env present) rather than actively pinged - its webhooks are
 *   POST-only and side-effecting, so probing them would trigger work.
 */
export async function GET(request: Request) {
  const ready = new URL(request.url).searchParams.has("ready");
  if (!ready) {
    return NextResponse.json({ status: "ok", service: "site-iq", time: new Date().toISOString() });
  }

  const checks: Record<string, string> = {
    n8n: process.env.N8N_AUDIT_WEBHOOK_URL ? "configured" : "unset",
  };
  let dbOk = false;
  try {
    const admin = createServiceClient();
    if (admin) {
      const { error } = await admin.from("rate_limits").select("key", { head: true }).limit(1);
      dbOk = !error;
    }
  } catch {
    dbOk = false;
  }
  checks.db = dbOk ? "ok" : "down";

  return NextResponse.json(
    { status: dbOk ? "ready" : "degraded", service: "site-iq", checks, time: new Date().toISOString() },
    { status: dbOk ? 200 : 503 },
  );
}
