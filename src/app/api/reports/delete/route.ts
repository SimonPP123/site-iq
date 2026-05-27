import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sanitizeErrorMessage } from "@/lib/security";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * POST /api/reports/delete  { ids: uuid[] }
 * Deletes the caller's own audits. Everything runs under the user's session + RLS, so a user can
 * only ever delete reports they own. Documents (no FK to reports) are removed first; deleting the
 * report then cascades to audit_steps + chat_messages.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A non-empty list of report ids is required" }, { status: 400 });
  }
  const { ids } = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Throttle deletes per user (a bulk delete touches documents + reports + cascades; don't let it be hammered).
  const userId = String(claims.claims.sub ?? "");
  const rl = await rateLimit(`delete:${userId}`, 20, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many delete requests. Please wait a moment." },
      { status: 429, headers: getRateLimitHeaders(rl) },
    );
  }

  try {
    // 1) Remove the chat corpus for these reports (RLS only matches the caller's own, and the
    //    parent report must still exist for the policy's ownership check - so do this first).
    const { error: docErr } = await supabase
      .from("documents")
      .delete()
      .filter("metadata->>report_id", "in", `(${ids.join(",")})`);
    if (docErr) throw docErr;

    // 2) Delete the reports the caller owns (RLS), cascading to audit_steps + chat_messages.
    const { data: deleted, error: repErr } = await supabase
      .from("reports")
      .delete()
      .in("id", ids)
      .select("id");
    if (repErr) throw repErr;

    return NextResponse.json({ deleted: deleted?.length ?? 0 });
  } catch (err) {
    console.error("[/api/reports/delete] failed", err);
    return NextResponse.json(
      { error: sanitizeErrorMessage(err, "Could not delete the selected audits") },
      { status: 500 },
    );
  }
}
