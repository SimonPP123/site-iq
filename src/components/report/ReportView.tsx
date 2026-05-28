"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { trackAuditCompleted, trackReportViewed, trackSampleViewed } from "@/lib/analytics";
import ReactMarkdown from "react-markdown";
import { CheckCircle2, XCircle, CircleDashed } from "@/components/icons";
import { useAuditSteps, type AuditStep } from "./useAuditSteps";
import { SiteIqGauge, DimensionRing } from "./SiteIqGauge";
import { ChatPanel } from "./ChatPanel";
import { normalizeReport } from "./normalize";
import { SiteHeader } from "@/components/SiteHeader";
import { CHECK_INFO } from "@/lib/audit/checkInfo";
import { WhatWeChecked } from "./WhatWeChecked";
import { ContactCTA } from "./ContactCTA";
import { CrawledPagesSection } from "./CrawledPagesSection";
import type { CheckResult, DimensionResult, AuditResult, FailingPage, FailureReason } from "@/lib/audit/types";

/** Defensive normalizer: reports persisted BEFORE the failingDetails migration have `failing: string[]`;
 *  reports persisted AFTER have `failing: Array<{path, reason?}>`. Accept both at render time so old
 *  audits keep displaying correctly without a one-shot DB migration. */
function normFailing(fp: unknown): FailingPage {
  return typeof fp === "string" ? { path: fp } : (fp as FailingPage);
}

/** Render a structured `FailureReason` as a short English sentence. Same helper as in WhatWeChecked,
 *  duplicated here to avoid a circular-import / shared-utils file for one small function. Length is
 *  already capped at persistence (sanitizeReason in checks.ts), so no further trimming needed. */
function renderReason(reason: FailureReason | undefined): string {
  if (!reason) return "did not pass";
  switch (reason.kind) {
    case "too_short":  return `${reason.actual} chars (too short, min ${reason.min})`;
    case "too_long":   return `${reason.actual} chars (too long, max ${reason.max})`;
    case "missing":    return `missing ${reason.what}`;
    case "noindex":    return "noindex directive set";
    case "http_status": return `returned HTTP ${reason.code}`;
    case "soft_404":   return `soft-404 (200 OK but the page reads as 'not found')`;
    case "non_https":  return "served over HTTP, not HTTPS";
    case "wrong_count": return `${reason.actual} of ${reason.what} (expected ${reason.expected})`;
    case "mismatch":   return `${reason.what} mismatch (expected '${reason.expected}', found '${reason.actual}')`;
    case "other":      return reason.note;
  }
}

/**
 * Slim per-check shape the UI needs: id, label, ratio, and the evidence (where we checked / which
 * pages failed). CheckResult carries additional scoring fields (weight, severity, dimension, etc.)
 * that are not needed in the report view layer - we project down to this subset.
 */
// `severity` is `Partial`-ed (i.e. optional) because old reports persisted before the severity-on-Check
// migration lack it, and the demo fixture in /sample also leaves it implicit. The renderer falls back
// to "info" when missing (lowest bucket), so a missing severity never crashes the histogram.
type Check = Pick<CheckResult, "id" | "label" | "ratio" | "evidence"> & Partial<Pick<CheckResult, "severity">>;

/**
 * UI-facing dimension: same as DimensionResult but with checks narrowed to the
 * slim Check projection (the view only reads id/label/ratio) and made optional
 * (not every code path guarantees the checks array is populated).
 */
type Dimension = Omit<DimensionResult, "checks"> & { checks?: Check[] };

/**
 * UI-facing result: AuditResult plus the UI-only fields that n8n writes at
 * audit completion time (page counts, AI summary, summary availability status).
 */
type Result = Omit<AuditResult, "dimensions"> & {
  pagesSampled?: number;
  pagesAttempted?: number;
  summary?: { markdown?: string } | null;
  summaryStatus?: "ok" | "unavailable";
  // Omit AuditResult's `dimensions` first, then re-add it with the slim Check projection.
  // (A plain `AuditResult & {dimensions}` would INTERSECT, making checks `CheckResult & Check`
  // and forcing every caller to supply the full check shape.)
  dimensions: Dimension[];
};

export type Report = {
  id: string; domain: string; status: string;
  score_overall: number | null; result: Result | null; error: string | null;
};

// Severity text colours. Darker (600) on light for contrast on white; the original 400
// shades on dark. `info`/`low` use a neutral that reads on both themes.
const SEV_COLOR: Record<string, string> = {
  critical: "text-red-600 dark:text-red-400",
  high: "text-orange-600 dark:text-orange-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-zinc-500 dark:text-zinc-400",
  info: "text-zinc-500 dark:text-zinc-400",
};
const SEV_HEX: Record<string, string> = {
  critical: "#f87171", high: "#fb923c", medium: "#fbbf24", low: "#52525b", info: "#52525b",
};
const GRADE_HEX: Record<string, string> = { A: "#10b981", B: "#34d399", C: "#f59e0b", D: "#fb923c", F: "#ef4444" };

/** Coloured score/grade pill (matches the gauge's semantic bands). */
function GradePill({ grade, score }: { grade: string; score: number }) {
  const c = GRADE_HEX[grade] ?? "#9a9aa7";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium tabular-nums"
      style={{ borderColor: `${c}55`, backgroundColor: `${c}1a`, color: c }}
    >
      {score}/100 <span className="opacity-50">·</span> Grade {grade}
    </span>
  );
}

export function ReportView({
  report: initial,
  initialSteps,
  demo = false,
}: {
  report: Report;
  initialSteps: AuditStep[];
  /** Public sample report: shows a "sample" banner and a sign-up CTA instead of the (auth-only) chat. */
  demo?: boolean;
}) {
  const [report, setReport] = useState<Report>(initial);
  const [stale, setStale] = useState(false);
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [sevFilter, setSevFilter] = useState<string>("all");
  const steps = useAuditSteps(report.id, initialSteps);
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Re-run the audit for the same domain on failure. The failed report's credit is refunded by a DB
  // trigger (migration 0008), so a retry doesn't double-charge the free plan.
  async function retryAudit() {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: report.domain }),
      });
      const data = (await res.json().catch(() => null)) as { reportId?: string; error?: string } | null;
      if (res.ok && data?.reportId) {
        router.push(`/audit/${data.reportId}`);
        return;
      }
      setRetryError(data?.error ?? "Could not start a new audit. Please try again.");
    } catch {
      setRetryError("Could not reach the server. Please try again.");
    } finally {
      setRetrying(false);
    }
  }

  // Live-update the report row itself. Treat the Realtime UPDATE as a NOTIFICATION ("something
  // changed"), NOT as the authoritative payload: the `result` jsonb now carries a pages list,
  // failing-page reasons, and an executive summary, so the row can run into Realtime's payload caps
  // (postgres_changes truncates / drops events when a row exceeds the configured size) - a silent
  // freeze on big audits exactly when the user is most invested. Pattern:
  //   - apply status/score/error from the small projection in the payload (always present)
  //   - on a terminal status (done/error), REST-refetch the full row to get the authoritative
  //     `result` blob - the source of truth for everything the UI needs to render
  //   - on socket failure, surface staleness rather than silently freezing
  // Sequence guard for the Realtime->REST race. Two terminal-status payloads arriving in quick
  // succession (e.g. n8n writes status=done then an error-handler trigger flips to status=error
  // 200ms later) fire two concurrent REST refetches; whichever's `await` resolves LAST wins via
  // setReport. Without a monotonic counter, that order is undefined and the user can see a stale
  // status win. The ref survives across handler invocations so each new event invalidates any
  // in-flight refetch from an older event. Pair with `cancelled` (unmount guard).
  const seqRef = useRef(0);
  useEffect(() => {
    if (report.status === "done" || report.status === "error") return;
    const supabase = createClient();
    let cancelled = false;
    const channel = supabase
      .channel(`reports:${report.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "reports", filter: `id=eq.${report.id}` },
        async (payload) => {
          // Slim projection of the payload - only the small columns we trust on the Realtime channel.
          const lite = payload.new as Pick<Report, "id" | "status" | "score_overall" | "error">;
          if (cancelled) return;
          const mySeq = ++seqRef.current;
          if (lite.status === "done" || lite.status === "error") {
            // Authoritative refetch. We CANNOT trust payload.new.result here - it may be truncated
            // (large jsonb hitting Realtime caps) or arrive on a separate UPDATE that the WAL slot
            // delivered partially. REST always gives us the committed row.
            const { data, error } = await supabase
              .from("reports")
              .select("*")
              .eq("id", report.id)
              .single();
            // Guard: cancelled OR a newer payload arrived while we were awaiting (mySeq is stale).
            // Without this, a later "error" payload's refetch could be clobbered by an earlier
            // "done" payload's refetch that resolved last.
            if (cancelled || mySeq !== seqRef.current) return;
            if (error || !data) {
              // Refetch failed; apply the status projection so the spinner stops and the user sees
              // the terminal state, but flag staleness so the "Refresh" hint shows.
              setReport((r) => ({ ...r, status: lite.status, score_overall: lite.score_overall ?? r.score_overall, error: lite.error ?? r.error }));
              setStale(true);
              return;
            }
            setReport(normalizeReport(data as Report));
          } else {
            // Intermediate transitions (e.g. queued -> running). No `result` to read yet; just
            // propagate the status so the step list / banner stays in sync.
            setReport((r) => ({ ...r, status: lite.status, score_overall: lite.score_overall ?? r.score_overall, error: lite.error ?? r.error }));
          }
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setStale(true);
      });
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [report.id, report.status]);

  // Defense-in-depth: never spin forever. If no terminal status arrives within a few minutes (a
  // slow run, or a lost write), surface a hint instead of an endless "Analyzing…".
  useEffect(() => {
    setStale(false);
    if (report.status === "done" || report.status === "error") return;
    const t = setTimeout(() => setStale(true), 4 * 60 * 1000);
    return () => clearTimeout(t);
  }, [report.status]);

  // Analytics: report-view + audit-completion events. ReportView (not useAuditSteps) is the right
  // home - it owns the report's queued -> done transition (via Realtime) AND has both report.domain
  // and report.id, which useAuditSteps does not. Ref-guarded so each fires at most once per mount:
  //  - demo (the public /sample) -> sample_report_viewed (never report_viewed/audit_completed);
  //  - a live report that is/just-became "done" -> report_viewed + audit_completed, exactly once.
  // No PII: only sample id (the demo domain), report id, the typed domain, and a fixed status.
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current) return;
    if (demo) {
      viewTracked.current = true;
      trackSampleViewed({ sample_id: report.domain });
      return;
    }
    if (report.status === "done") {
      viewTracked.current = true;
      trackReportViewed({ report_id: report.id });
      trackAuditCompleted({
        audit_domain: report.domain,
        report_id: report.id,
        audit_status: "done",
      });
    }
  }, [demo, report.status, report.id, report.domain]);

  const result = report.result;

  // Tracking caveat: tags are routinely injected at runtime by a tag manager (GTM, Tealium, Segment)
  // or loaded only after consent, so a static crawl can miss them. If any key tracking signal looks
  // incomplete, say so - so the Tracking dimension doesn't read as "wrong" on a likely-fine site.
  const tChecks = result?.dimensions.find((d) => d.id === "tracking")?.checks ?? [];
  const tRatio = (id: string) => tChecks.find((c) => c.id === id)?.ratio ?? null;
  const hasGtm = tRatio("T3") === 1;
  const trackingIncomplete = [tRatio("T1"), tRatio("T5"), tRatio("T6"), tRatio("T7")].some(
    (x) => x !== null && x < 1,
  );
  // Whole Tracking dimension N/A: the crawl saw no tracking layer at all, so it's excluded from the score.
  const trackingNA = !!result?.dimensions.find((d) => d.id === "tracking")?.notApplicable;

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main id="main-content" className="mx-auto max-w-3xl px-6 py-10">
        {demo && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 p-4">
            <p className="text-sm text-foreground">
              <span className="font-semibold">Sample report.</span> An illustrative example - run a free audit of your own site to get a real one.
            </p>
            <Link
              href="/"
              className="shrink-0 rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
            >
              Audit your site →
            </Link>
          </div>
        )}
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Website intelligence report
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{report.domain}</h1>
          {result && <GradePill grade={result.grade} score={result.overall} />}
        </div>
        {result?.pagesSampled ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {result.pagesAttempted && result.pagesAttempted > result.pagesSampled
              ? `Audited ${result.pagesSampled} of ${result.pagesAttempted} pages (${
                  result.pagesAttempted - result.pagesSampled
                } unreachable)`
              : `Audited ${result.pagesSampled} page${result.pagesSampled === 1 ? "" : "s"}`}
          </p>
        ) : null}

        {report.status === "error" && (
          <div role="alert" className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="font-medium text-red-700 dark:text-red-300">We couldn&apos;t finish this audit.</p>
            <p className="mt-1 text-sm text-red-700/90 dark:text-red-400/90">
              {report.error || "The site may be unreachable, too slow, or blocking automated crawlers."} Your free-plan credit was not used.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={retryAudit}
                disabled={retrying}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {retrying ? "Starting…" : "Try again"}
              </button>
              <Link href="/" className="text-sm text-accent">Audit a different site →</Link>
            </div>
            {retryError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{retryError}</p>}
          </div>
        )}

        {!result && report.status === "done" && (
          <section className="surface mt-8 p-6">
            <p className="mb-1 font-medium">We finished, but couldn&apos;t load the results.</p>
            <p className="mb-4 text-sm text-muted-foreground">
              This is usually temporary - refresh the page, or start a new audit.
            </p>
            <Link href="/" className="text-sm font-medium text-accent">Audit a different site →</Link>
          </section>
        )}

        {!result && report.status !== "error" && report.status !== "done" && (
          <section className="surface mt-8 p-6">
            <p className="mb-1 flex items-center gap-2 font-medium">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              Analyzing {report.domain}…
            </p>
            <p className="mb-4 text-sm text-muted-foreground">This usually takes a minute or two - you can leave this open.</p>
            <ol role="status" aria-live="polite" className="space-y-2.5 text-sm">
              {steps.length > 0
                ? steps.map((s) => (
                    <li key={s.id} className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className={
                          s.status === "done"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : s.status === "error"
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground"
                        }
                      >
                        {s.status === "done" ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : s.status === "error" ? (
                          <XCircle className="h-4 w-4" />
                        ) : (
                          <CircleDashed className="h-4 w-4" />
                        )}
                      </span>
                      <span className="capitalize">{s.step}</span>
                      <span className="ml-auto tabular-nums text-muted-foreground">{s.progress}%</span>
                    </li>
                  ))
                : [
                    "Crawling the site (up to 10 pages)",
                    "Running 58 checks across SEO, tracking, GEO and tech",
                    "Scoring the results",
                    "Writing the AI summary",
                  ].map((label) => (
                    <li key={label} className="flex items-center gap-3 text-muted-foreground">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/60" aria-hidden />
                      {label}
                    </li>
                  ))}
            </ol>
            {stale && (
              <p role="alert" className="mt-4 text-sm text-amber-700 dark:text-amber-400">
                This is taking longer than usual - the audit may still be running, or the site may be
                slow or blocking crawlers. Try refreshing in a moment.
              </p>
            )}
          </section>
        )}

        {result && (
          <>
            <section className="surface mt-8 flex flex-col items-center gap-8 p-8 sm:flex-row sm:justify-between">
              <SiteIqGauge score={result.overall} grade={result.grade} />
              <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
                {result.dimensions.map((d) =>
                  d.notApplicable ? (
                    <div key={d.id} className="flex flex-col items-center justify-center gap-1 text-center">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                        Not assessed
                      </span>
                      <span className="text-sm font-medium text-foreground">{d.label}</span>
                      <span className="text-xs text-muted-foreground/70">excluded from score</span>
                    </div>
                  ) : (
                    <DimensionRing key={d.id} label={d.label} score={d.score} />
                  ),
                )}
              </div>
            </section>

            {trackingNA ? (
              <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200/90">
                <span className="font-medium">Tracking not assessed.</span> We couldn&apos;t detect this
                site&apos;s analytics or consent setup from the crawl - modern sites load these at runtime
                (tag managers, after consent) or behind bot protection, so a crawl often cannot see them.
                Rather than guess, we excluded Tracking from the overall score. Verify your setup in Google
                Tag Assistant.
              </p>
            ) : trackingIncomplete ? (
              <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200/90">
                <span className="font-medium">Heads up:</span> some tracking signals weren&apos;t detected.{" "}
                {hasGtm
                  ? "This site runs Google Tag Manager, which often injects GA4, Consent Mode and cookie banners at runtime"
                  : "Tag managers (GTM, Tealium, Segment) and consent-gated setups often inject GA4, Consent Mode and cookie banners at runtime"}
                , so a static crawl can&apos;t see them - your real Tracking score may be higher. Verify in your
                tag manager or Google Tag Assistant.
              </p>
            ) : null}

            {/* Phase 2C + 2E: "Pages audited" - lists which URLs were sampled and which ones
                Firecrawl couldn't reach (collapsed-by-default per multi-agent UX review). Renders
                nothing on old reports without a `pages` field. */}
            <CrawledPagesSection
              pages={result.pages}
              pagesWithIssues={result.pagesWithIssues}
              pagesExcluded={result.pagesExcluded}
              pagesFailed={result.pagesFailed}
              dimensions={result.dimensions}
            />

            {result.summary?.markdown && (
              <section className="surface mt-6 p-6">
                <h2 className="text-lg font-semibold">Executive summary</h2>
                <div className="prose dark:prose-invert prose-sm mt-3 max-w-none prose-headings:font-semibold prose-a:text-accent">
                  <ReactMarkdown>{result.summary.markdown}</ReactMarkdown>
                </div>
              </section>
            )}

            {!result.summary?.markdown && result.summaryStatus === "unavailable" && (
              <p className="surface mt-6 p-4 text-sm text-muted-foreground">
                The executive summary could not be generated for this report (the AI step was
                unavailable). The scores and findings below are unaffected.
              </p>
            )}

            <section className="mt-8">
              <h2 className="text-lg font-semibold">Findings &amp; action plan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sorted by impact vs. effort - the top of the list is where to start. Click any item for why it
                matters and how to fix it. A &quot;needs approval&quot; tag means the fix touches consent or
                tracking, so it usually needs sign-off (legal or marketing) before you ship it.
              </p>
              {(() => {
                const SEV_ORDER = ["critical", "high", "medium", "low"];
                const counts = result.actionPlan.reduce<Record<string, number>>((m, a) => { m[a.severity] = (m[a.severity] ?? 0) + 1; return m; }, {});
                const present = SEV_ORDER.filter((s) => counts[s]);
                // Map checkId -> check so each finding can show the pages where the problem was found.
                const checkById = new Map(result.dimensions.flatMap((d) => (d.checks ?? []).map((cc) => [cc.id, cc] as const)));
                const filtered = sevFilter === "all" ? result.actionPlan : result.actionPlan.filter((a) => a.severity === sevFilter);
                const visible = filtered.slice(0, showAllFindings ? undefined : 20);
                return (
              <>
              {result.actionPlan.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter findings by severity">
                  {(["all", ...present] as const).map((key) => {
                    const n = key === "all" ? result.actionPlan.length : counts[key] ?? 0;
                    const active = sevFilter === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSevFilter(key)}
                        aria-pressed={active}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${active ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted-foreground hover:border-accent/60 hover:text-foreground"}`}
                      >
                        {key !== "all" && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEV_HEX[key] ?? "#52525b" }} />}
                        {key} <span className="tabular-nums opacity-60">{n}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <ul className="mt-4 space-y-2.5">
                {visible.map((a) => {
                  const info = CHECK_INFO[a.checkId];
                  const ev = checkById.get(a.checkId)?.evidence;
                  return (
                    <li key={a.checkId}>
                      <details className="group surface overflow-hidden border-l-2" style={{ borderLeftColor: SEV_HEX[a.severity] ?? "#52525b" }}>
                        <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
                          <div className="flex items-start justify-between gap-3">
                            <span className="font-medium">{a.finding}</span>
                            <span className={`shrink-0 text-xs font-medium uppercase tracking-wide ${SEV_COLOR[a.severity] ?? ""}`}>
                              {a.severity}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">impact {a.impact}/5</span>
                            <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">effort {a.effort}/5</span>
                            {a.quickWin && <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">quick win</span>}
                            {a.requiresApproval && <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-400">needs approval</span>}
                            {ev?.failing?.length ? (
                              <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                                {ev.failing.length + (ev.more ?? 0)} {ev.failing.length + (ev.more ?? 0) === 1 ? "page" : "pages"} affected
                              </span>
                            ) : null}
                            {info && <span className="ml-auto text-accent group-open:hidden">Why &amp; how to fix →</span>}
                          </div>
                        </summary>
                        {(info || ev) && (
                          <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
                            {info && <p><span className="font-medium">Why it matters. </span><span className="text-muted-foreground">{info.why}</span></p>}
                            {info && <p><span className="font-medium">How to fix. </span><span className="text-muted-foreground">{info.fix}</span></p>}
                            {info?.example && (
                              <pre className="overflow-x-auto rounded-md bg-background/60 p-2 text-xs text-muted-foreground"><code>{info.example}</code></pre>
                            )}
                            {ev && (
                              <div className="space-y-1.5">
                                <p><span className="font-medium">Where we checked. </span><span className="text-muted-foreground">{ev.where}.</span></p>
                                {ev.failing && ev.failing.length > 0 && (
                                  <div className="space-y-1">
                                    <p className="font-medium text-amber-700 dark:text-amber-400">Problem on:</p>
                                    <ul className="space-y-0.5">
                                      {ev.failing.map((raw) => {
                                        const fp = normFailing(raw);
                                        return (
                                          <li key={fp.path} className="flex flex-wrap items-baseline gap-x-2">
                                            <code className="rounded bg-background/60 px-1.5 py-0.5 text-xs text-muted-foreground">{fp.path}</code>
                                            {fp.reason && (
                                              <span className="text-xs text-muted-foreground">{renderReason(fp.reason)}</span>
                                            )}
                                          </li>
                                        );
                                      })}
                                    </ul>
                                    {ev.more ? <p className="text-xs text-muted-foreground">+{ev.more} more</p> : null}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </details>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li className="surface p-4 text-sm text-muted-foreground">
                    {result.actionPlan.length === 0 ? "No issues found - nicely done." : "No findings at this severity."}
                  </li>
                )}
              </ul>
              {filtered.length > 20 && (
                <button
                  type="button"
                  onClick={() => setShowAllFindings((v) => !v)}
                  className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm text-accent transition hover:border-accent/60"
                >
                  {showAllFindings ? "Show fewer" : `Show all ${filtered.length} findings`}
                </button>
              )}
              </>
                );
              })()}
            </section>

            <WhatWeChecked dimensions={result.dimensions} />

            {report.status === "done" &&
              (demo ? (
                <section className="surface mt-8 p-6 text-center">
                  <h2 className="text-lg font-semibold">AI chat is included with every report</h2>
                  <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
                    Every report includes an AI chat grounded in the site&apos;s crawled pages - ask why a
                    score is low, what to fix first, or how to action a finding. Sign up to chat with your
                    own audits.
                  </p>
                  <Link
                    href="/signup"
                    className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
                  >
                    Create a free account
                  </Link>
                </section>
              ) : (
                <ChatPanel reportId={report.id} domain={report.domain} />
              ))}

            {report.status === "done" && !demo && <ContactCTA domain={report.domain} />}
          </>
        )}
      </main>
    </div>
  );
}
