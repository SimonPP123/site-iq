import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { FREE_PLAN, auditsThisMonth } from "@/lib/plan";
import { DataControls } from "@/components/account/DataControls";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?redirect=/account");

  const email = String(claims.claims.email ?? "your account");
  const userId = String(claims.claims.sub ?? "");
  const used = await auditsThisMonth(supabase, userId);
  const cap = FREE_PLAN.auditsPerMonth;
  const remaining = Math.max(0, cap - used);
  const pct = Math.min(100, Math.round((used / cap) * 100));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your plan, usage, and account settings.</p>

        {/* Profile */}
        <section className="surface mt-8 p-6">
          <h2 className="text-sm font-semibold text-foreground">Profile</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Email</dt>
              <dd className="mt-1 text-sm text-foreground">{email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Plan</dt>
              <dd className="mt-1 inline-flex items-center gap-2 text-sm text-foreground">
                <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">Free</span>
                <span className="text-muted-foreground">free while in beta</span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Usage */}
        <section className="surface mt-6 p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-foreground">Usage this month</h2>
            <span className="text-sm tabular-nums text-muted-foreground">
              {used} / {cap} audits
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${remaining === 0 ? "bg-amber-400" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={used}
              aria-valuemin={0}
              aria-valuemax={cap}
              aria-label={`${used} of ${cap} audits used this month`}
            />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {remaining > 0
              ? `${remaining} audit${remaining === 1 ? "" : "s"} left this month. Resets on the 1st.`
              : "You have used all your free audits this month. Your limit resets on the 1st."}
          </p>
          <ul className="mt-4 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
            <li>{cap} audits / month</li>
            <li>Up to {FREE_PLAN.maxPagesPerAudit} pages per audit</li>
            <li>{FREE_PLAN.chatMessagesPerAudit} chat messages / audit</li>
            <li>{FREE_PLAN.historyDays}-day report history view (data retained up to 90 days)</li>
          </ul>
        </section>

        {/* Plan / actions */}
        <section className="surface mt-6 p-6">
          <h2 className="text-sm font-semibold text-foreground">Need more?</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Pro and Agency plans (higher limits, scheduled monitoring, PDF export) are on the way.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
            >
              See plans
            </Link>
            <Link
              href="/audits"
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/60"
            >
              My audits
            </Link>
            <SignOutButton />
          </div>
        </section>

        {/* Data & privacy (GDPR: portability + erasure) */}
        <section className="surface mt-6 p-6">
          <h2 className="text-sm font-semibold text-foreground">Data &amp; privacy</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Export everything we hold about you, or permanently delete your account and all its data.
            You can also delete individual reports from{" "}
            <Link href="/audits" className="underline underline-offset-4 hover:text-foreground">My audits</Link>.
          </p>
          <div className="mt-4">
            <DataControls />
          </div>
        </section>
      </main>
    </div>
  );
}
