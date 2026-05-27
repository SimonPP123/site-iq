import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sanitizeErrorMessage } from "@/lib/security";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";

/**
 * POST /api/account/delete - permanently delete the caller's account and ALL their data (GDPR
 * right-to-erasure). Deleting the auth user cascades reports -> audit_steps + chat_messages and
 * audit_usage (FK ON DELETE CASCADE); `documents` has no FK to reports, so its embeddings are
 * purged explicitly first (by metadata->>report_id) before the cascade removes the report ids.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = String(claims.claims.sub ?? "");

  const rl = await rateLimit(`account-delete:${userId}`, 3, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429, headers: getRateLimitHeaders(rl) });
  }

  const admin = createServiceClient();
  if (!admin) {
    console.error("[/api/account/delete] service client unavailable");
    return NextResponse.json({ error: "Account deletion is not configured" }, { status: 503 });
  }

  try {
    // Purge the crawled-page embeddings (no FK to reports) BEFORE the auth-user cascade removes the
    // reports. ids come from the caller's own reports under RLS, so they are trusted DB UUIDs.
    const { data: reports } = await supabase.from("reports").select("id");
    const ids = (reports ?? []).map((r) => (r as { id: string }).id);
    if (ids.length > 0) {
      await admin.from("documents").delete().filter("metadata->>report_id", "in", `(${ids.join(",")})`);
    }
    // Delete the auth user -> cascades reports (-> audit_steps + chat_messages) and audit_usage.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[/api/account/delete] failed", { userId, err });
    Sentry.captureException(err);
    return NextResponse.json(
      { error: sanitizeErrorMessage(err, "Could not delete your account. Please contact support.") },
      { status: 500 },
    );
  }
}
