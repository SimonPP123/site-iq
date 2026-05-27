import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { AuditsList, type AuditRow } from "@/components/AuditsList";
import { FREE_PLAN, historyCutoffIso, auditsThisMonth } from "@/lib/plan";

export const dynamic = "force-dynamic";

// Per-user audit history - never index it.
export const metadata = { robots: { index: false, follow: false } };

export default async function AuditsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?redirect=/audits");

  // Both reads only depend on the resolved auth claims, so run them concurrently instead of
  // serially. RLS scopes the reports query to the signed-in user's own rows; the free plan shows a
  // rolling history window (older reports are retained but not listed here).
  const [used, { data }] = await Promise.all([
    auditsThisMonth(supabase, String(claims.claims.sub ?? "")),
    supabase
      .from("reports")
      .select("id, domain, status, score_overall, created_at")
      .gte("created_at", historyCutoffIso())
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My audits</h1>
            <p className="mt-1 text-sm text-muted-foreground">Click any to reopen it and its chat, or select some to delete. Free plan shows the last {FREE_PLAN.historyDays} days.</p>
            <Link
              href="/account"
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-foreground"
            >
              Free plan · {used}/{FREE_PLAN.auditsPerMonth} audits this month
            </Link>
          </div>
          <Link href="/" className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90">
            New audit
          </Link>
        </div>

        <AuditsList initial={(data ?? []) as AuditRow[]} />
      </main>
    </div>
  );
}
