import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { DIMENSIONS, TOTAL_CHECKS, type RubricCheck } from "@/lib/audit/rubric";

export const metadata: Metadata = {
  title: "What we check",
  description:
    "Radical transparency: the 58 deterministic rules behind every Site IQ score, the four scored dimensions and their weights, how the math works, the grade bands, and the honest limits of a fast snapshot audit.",
  alternates: { canonical: "/methodology" },
};

// Dimensions, checks, weights and severities are DERIVED FROM THE ENGINE (src/lib/audit/rubric.ts),
// so this page can never drift from how the score is actually computed.
type Check = RubricCheck;

// The critical checks (the only ones that can trigger the failure floor) - derived from the engine,
// not hardcoded, so the sentence below stays correct if a check's severity ever changes.
const CRITICAL_IDS = DIMENSIONS.flatMap((d) => d.checks)
  .filter((c) => c.severity === "critical")
  .map((c) => c.id);

const GRADE_BANDS: { grade: string; range: string }[] = [
  { grade: "A", range: "90-100" },
  { grade: "B", range: "80-89" },
  { grade: "C", range: "70-79" },
  { grade: "D", range: "60-69" },
  { grade: "F", range: "0-59" },
];

const SEVERITY_STYLES: Record<Check["severity"], string> = {
  critical: "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-500/30",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/30",
  medium: "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-500/30",
  low: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 ring-1 ring-inset ring-zinc-500/25",
  info: "bg-slate-500/15 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-500/25",
};

function SeverityBadge({ severity }: { severity: Check["severity"] }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}

function ChecksTable({ checks, captionId }: { checks: Check[]; captionId: string }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-left text-sm" aria-describedby={captionId}>
        <thead>
          <tr className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="w-16 px-4 py-3 font-medium">ID</th>
            <th scope="col" className="px-4 py-3 font-medium">Check</th>
            <th scope="col" className="w-28 px-4 py-3 font-medium">Severity</th>
            <th scope="col" className="w-20 px-4 py-3 text-right font-medium">Weight</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.id}</td>
              <td className="px-4 py-3 text-foreground">{c.check}</td>
              <td className="px-4 py-3">
                <SeverityBadge severity={c.severity} />
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                {c.weight}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
        {/* Intro */}
        <header className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Radical transparency
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
            What we check
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-balance">
            Site IQ scores are computed by <span className="text-foreground">{TOTAL_CHECKS} deterministic rules</span> -
            the same site always gets the same score. AI only writes the summary and answers the
            chat; it never sets the score.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Every rule below runs in typed, unit-tested code and is mirrored 1:1 into the audit
            engine, so nothing on this page is marketing fluff - it is the exact rubric that produces
            your grade.
          </p>
        </header>

        {/* Dimensions and weights */}
        <section aria-labelledby="dimensions-heading" className="mt-14">
          <h2 id="dimensions-heading" className="text-2xl font-semibold tracking-tight">
            The four dimensions
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            The overall score is a weighted average of four dimensions. The weights reflect how much
            each area moves real-world visibility.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {DIMENSIONS.map((d) => (
              <div key={d.key} className="surface p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-semibold text-foreground">{d.name}</h3>
                  <span className="rounded-md bg-accent/15 px-2 py-0.5 text-sm font-semibold text-accent">
                    {d.weight}%
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d.measures}</p>
                <p className="mt-3 text-xs text-muted-foreground/80">{d.checks.length} checks</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground/80">
            Per-check weights are relative within a dimension; the dimension score renormalizes by
            the sum of applicable weights, so they do not need to total 100.
          </p>
        </section>

        {/* The full check list */}
        <section aria-labelledby="checks-heading" className="mt-16">
          <h2 id="checks-heading" className="text-2xl font-semibold tracking-tight">
            The {TOTAL_CHECKS} checks
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Severity drives the action-plan impact and, for{" "}
            <span className="text-foreground">critical</span> checks only, the failure floor (below).
            Checks run over up to 10 sampled pages - the homepage plus the most commercially relevant
            pages.
          </p>

          {DIMENSIONS.map((d) => {
            const captionId = `checks-${d.key}-caption`;
            return (
              <div key={d.key} className="mt-10">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold text-foreground">
                    {d.name}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({d.checks.length} checks)
                    </span>
                  </h3>
                  <span className="text-sm text-muted-foreground">Dimension weight {d.weight}%</span>
                </div>
                <p id={captionId} className="sr-only">
                  {d.name} checks, with ID, description, severity, and relative weight.
                </p>
                <ChecksTable checks={d.checks} captionId={captionId} />
              </div>
            );
          })}
        </section>

        {/* Scoring */}
        <section aria-labelledby="scoring-heading" className="mt-16">
          <h2 id="scoring-heading" className="text-2xl font-semibold tracking-tight">
            How the score is computed
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Each check returns a ratio in [0, 1]: 1 means it passes on every sampled page, 0 means it
            fails, and a fraction means partial coverage (for example, 3 of 10 pages have a valid
            title). Some checks return <span className="text-foreground">N/A</span> when their input
            was not gathered - those are renormalized out, so a site is never penalized for something
            that could not be measured.
          </p>

          <div className="surface mt-6 overflow-x-auto p-5">
            <pre className="text-sm leading-relaxed text-muted-foreground">
              <code>{`dimension_score = 100 * Σ(weight · ratio) / Σ(weight)   over APPLICABLE checks only
overall         = 0.30·SEO + 0.25·Tracking + 0.25·GEO + 0.20·Tech`}</code>
            </pre>
          </div>

          <h3 className="mt-8 text-lg font-semibold text-foreground">Critical-failure floor</h3>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            A failing critical check applies a two-level floor so one catastrophic issue cannot be
            hidden by strong averages:
          </p>
          <ol className="mt-4 max-w-3xl list-decimal space-y-2 pl-6 text-sm leading-relaxed text-muted-foreground">
            <li>
              The affected dimension is capped at <span className="text-foreground">59</span> (a D at
              best).
            </li>
            <li>
              The overall score is dropped one grade band below whatever the weighted math produced
              (for example, math of 88 with a critical failure becomes 79, a C).
            </li>
          </ol>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Only the {CRITICAL_IDS.length} critical checks ({CRITICAL_IDS.join(", ")}) can trigger the
            floor, because they are the signals a static crawl reads with high confidence and that
            genuinely zero a site&apos;s visibility.
          </p>

          <h3 className="mt-8 text-lg font-semibold text-foreground">Grade bands</h3>
          <div className="mt-5 overflow-x-auto rounded-xl border border-border sm:max-w-sm">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Grade</th>
                  <th scope="col" className="px-4 py-3 font-medium">Score range</th>
                </tr>
              </thead>
              <tbody>
                {GRADE_BANDS.map((g) => (
                  <tr key={g.grade} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 font-semibold text-foreground">{g.grade}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">
                      {g.range}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted-foreground/80">
            The headline overall score is an integer; per-dimension scores keep one decimal.
          </p>
        </section>

        {/* Honest limits */}
        <section aria-labelledby="limits-heading" className="mt-16">
          <h2 id="limits-heading" className="text-2xl font-semibold tracking-tight">
            Honest limits
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            A fast snapshot makes trade-offs. We would rather state them plainly than over-claim.
          </p>
          <div className="mt-6 space-y-4">
            <div className="surface border-l-2 border-l-accent/60 p-5">
              <h3 className="text-base font-semibold text-foreground">
                10-page snapshot, not a full-site crawl
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Site IQ samples the homepage plus the most commercially relevant pages. It
                complements crawler-grade tools (Ahrefs, Screaming Frog); it does not replace them for
                site-wide patterns like duplicate titles across thousands of URLs, orphan pages, or
                broken-link clusters.
              </p>
            </div>
            <div className="surface border-l-2 border-l-accent/60 p-5">
              <h3 className="text-base font-semibold text-foreground">
                A static crawl cannot see runtime-injected tags
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                GA4, Consent Mode, and CMP banners are routinely injected by a tag manager (GTM,
                Tealium, Segment) at runtime and can be invisible to a single static crawl, so the
                engine cannot prove their absence. That is exactly why Tracking is never a critical
                dimension and the report surfaces a caveat when tracking looks incomplete - rather
                than scoring a likely-fine site as negligent.
              </p>
            </div>
            <div className="surface border-l-2 border-l-accent/60 p-5">
              <h3 className="text-base font-semibold text-foreground">
                Static performance proxies, not field Core Web Vitals
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Layout-stability and script-deferral checks are a hygiene proxy. For real Core Web
                Vitals and field data, use a lab/field tool such as PageSpeed Insights.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
