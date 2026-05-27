import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Free-plan limits. Billing is not live yet, so EVERY user is on Free - these are enforced for all
 * accounts. When paid plans ship, add a `plan` lookup and branch here. Tune the numbers in one place.
 * (maxPagesPerAudit is enforced inside the n8n workflow, listed here for documentation.)
 */
export const FREE_PLAN = {
  auditsPerMonth: 3,
  chatMessagesPerAudit: 5,
  historyDays: 7,
  maxPagesPerAudit: 10,
} as const;

/** UTC 'YYYY-MM' period key - must match consume_audit_credit() in the DB (migration 0007). */
export function usagePeriod(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

/**
 * Audits the user has STARTED this calendar month (UTC), read from the immutable `audit_usage`
 * counter - NOT a live count of `reports`. This is deliberate: deleting an audit must never refund a
 * free-plan credit, so usage is tracked by a counter that only `consume_audit_credit()` increments.
 */
export async function auditsThisMonth(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("audit_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("period", usagePeriod())
    .maybeSingle();
  if (error) console.error("[plan] auditsThisMonth read failed:", error.message);
  return data?.count ?? 0;
}

/** User (not assistant) chat messages already sent for a report. RLS scopes via report ownership. */
export async function chatMessagesForReport(
  supabase: SupabaseClient,
  reportId: string,
): Promise<number> {
  const { count } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("report_id", reportId)
    .eq("role", "user");
  return count ?? 0;
}

/** ISO timestamp marking the start of the free-plan history window (now - historyDays). */
export function historyCutoffIso(): string {
  return new Date(Date.now() - FREE_PLAN.historyDays * 24 * 60 * 60 * 1000).toISOString();
}
