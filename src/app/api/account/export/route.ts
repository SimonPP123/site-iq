import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/account/export - the caller's data in a portable JSON file (GDPR data portability).
 * Everything is read under the user session + RLS, so it only ever returns the caller's own rows;
 * no service-role access is needed.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = String(claims.claims.sub ?? "");
  const email = (claims.claims as { email?: string }).email ?? null;

  const rl = await rateLimit(`account-export:${userId}`, 5, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429, headers: getRateLimitHeaders(rl) });
  }

  const [{ data: reports }, { data: chatMessages }, { data: auditUsage }] = await Promise.all([
    supabase.from("reports").select("*"),
    supabase.from("chat_messages").select("*"),
    supabase.from("audit_usage").select("*"),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { id: userId, email },
    reports: reports ?? [],
    chatMessages: chatMessages ?? [],
    auditUsage: auditUsage ?? [],
  };

  return NextResponse.json(payload, {
    headers: { "Content-Disposition": 'attachment; filename="site-iq-export.json"' },
  });
}
