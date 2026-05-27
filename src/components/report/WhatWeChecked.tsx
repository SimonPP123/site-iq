"use client";

import { CHECK_INFO } from "@/lib/audit/checkInfo";
import type { CheckEvidence } from "@/lib/audit/types";

type Check = { id: string; label: string; ratio: number | null; evidence?: CheckEvidence };
type Dimension = {
  id: string;
  label: string;
  score: number;
  rawScore: number;
  capped: boolean;
  notApplicable?: boolean;
  checks?: Check[];
};

/** Resolve a check's ratio into an accessible, colour-independent status. */
type Status = {
  /** Short word for screen readers / aria-label, e.g. "Passed". */
  word: string;
  /** Glyph shown to sighted users (decorative; status conveyed via aria-label). */
  glyph: string;
  /** Optional extra text shown next to the glyph (e.g. "60%", "N/A"). */
  badge?: string;
  /** Tailwind text colour for the indicator. */
  color: string;
  /** Tailwind background tint for the indicator chip. */
  bg: string;
};

function statusFor(ratio: number | null): Status {
  if (ratio === null) {
    return { word: "Not applicable", glyph: "-", badge: "N/A", color: "text-zinc-500 dark:text-zinc-400", bg: "bg-muted" };
  }
  if (ratio >= 1) {
    return { word: "Passed", glyph: "✓", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/15" };
  }
  if (ratio <= 0) {
    return { word: "Failed", glyph: "✗", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/15" };
  }
  const pct = Math.round(ratio * 100);
  return { word: `Partial (${pct}%)`, glyph: "◑", badge: `${pct}%`, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/15" };
}

/** The accessible status indicator that doubles as a checkbox. Status is exposed
 *  via aria-label (text, not colour alone); the glyph + tint are decorative. */
function StatusIndicator({ status }: { status: Status }) {
  return (
    <span
      role="img"
      aria-label={status.word}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${status.bg} ${status.color}`}
    >
      <span aria-hidden="true" className="text-sm leading-none">
        {status.glyph}
      </span>
      {status.badge && <span aria-hidden="true">{status.badge}</span>}
    </span>
  );
}

/** Coverage summary line shown in the expanded panel, reflecting the check's ratio. */
function CoverageLine({ ratio }: { ratio: number | null }) {
  if (ratio === null) return null;
  if (ratio >= 1) {
    return (
      <p className="text-muted-foreground">
        <span className="font-medium text-emerald-600 dark:text-emerald-400">Passed</span> on every sampled page.
      </p>
    );
  }
  if (ratio <= 0) {
    // Polarity-neutral wording. "Not detected" was wrong for "absence-is-good" checks (e.g. "No legacy
    // Universal Analytics", "robots does not block the whole site"): there a failure means the thing
    // WAS found, so "Not detected" contradicted both the red Failed status and the fix advice.
    // "Did not pass" is correct whether the check passes by presence or by absence.
    return (
      <p className="text-muted-foreground">
        <span className="font-medium text-red-600 dark:text-red-400">Did not pass</span> on the pages we sampled.
      </p>
    );
  }
  const pct = Math.round(ratio * 100);
  return (
    <p className="text-muted-foreground">
      <span className="font-medium text-amber-600 dark:text-amber-400">Partial</span> - passed on ~{pct}% of the pages we sampled.
    </p>
  );
}

/** A single criterion row. Always expandable when CHECK_INFO has guidance or the check is N/A
 *  (so users can read the whenNA explanation). Plain list item only as a last resort. */
function CheckRow({ check }: { check: Check }) {
  const status = statusFor(check.ratio);
  const info = CHECK_INFO[check.id];

  // Show an expandable row when we have info or per-page evidence, OR when the check is N/A (even
  // without info, a minimal N/A notice is better than a silent dash).
  const isNA = check.ratio === null;
  const hasContent = !!info || isNA || !!check.evidence;

  if (!hasContent) {
    return (
      <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
        <StatusIndicator status={status} />
        <span>{check.label}</span>
      </li>
    );
  }

  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
          <StatusIndicator status={status} />
          <span className="flex-1">{check.label}</span>
          {/* Click affordance: a hint label (what you'll see) + an always-visible chevron that rotates
              when the row opens, so it's obvious each criterion expands to its evidence. */}
          <span className="shrink-0 text-xs text-accent group-open:hidden">
            {isNA ? "Why N/A" : "Why & how to fix"}
          </span>
          <span
            aria-hidden="true"
            className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          >
            ⌄
          </span>
        </summary>
        <div className="space-y-3 border-t border-border bg-background/40 px-4 py-3 pl-12 text-sm">
          {/* N/A explanation - shown prominently when ratio is null */}
          {isNA && info?.whenNA && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50">
              <p>
                <span className="font-medium">Why this is N/A. </span>
                <span className="text-muted-foreground">{info.whenNA}</span>
              </p>
            </div>
          )}

          {/* Fallback N/A notice when there is no whenNA text */}
          {isNA && !info?.whenNA && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50">
              <p className="text-muted-foreground">
                <span className="font-medium">Why this is N/A. </span>
                This check does not apply to this site or the required data was not available for this audit. It is excluded from the score so you are not penalised.
              </p>
            </div>
          )}

          {/* What we check - shown when looksFor is set */}
          {info?.looksFor && (
            <p>
              <span className="font-medium">What we check. </span>
              <span className="text-muted-foreground">{info.looksFor}</span>
            </p>
          )}

          {/* Coverage line - shown for non-N/A checks */}
          {!isNA && <CoverageLine ratio={check.ratio} />}

          {/* Where we checked + the exact pages with the problem (per-page checks). For site-level
              checks (robots.txt, response headers, tracking detection) there is no page list. */}
          {!isNA && check.evidence && (
            <div className="space-y-1.5">
              <p>
                <span className="font-medium">Where we checked. </span>
                <span className="text-muted-foreground">{check.evidence.where}.</span>
              </p>
              {check.evidence.failing && check.evidence.failing.length > 0 && (
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-medium text-amber-700 dark:text-amber-400">Problem on:</span>
                  {check.evidence.failing.map((path) => (
                    <code
                      key={path}
                      className="rounded bg-background/60 px-1.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {path}
                    </code>
                  ))}
                  {check.evidence.more ? (
                    <span className="text-xs text-muted-foreground">+{check.evidence.more} more</span>
                  ) : null}
                </p>
              )}
            </div>
          )}

          {/* Why it matters and how to fix - shown for non-N/A checks */}
          {!isNA && info?.why && (
            <p>
              <span className="font-medium">Why it matters. </span>
              <span className="text-muted-foreground">{info.why}</span>
            </p>
          )}
          {!isNA && info?.fix && (
            <p>
              <span className="font-medium">How to fix. </span>
              <span className="text-muted-foreground">{info.fix}</span>
            </p>
          )}
          {!isNA && info?.example && (
            <pre className="overflow-x-auto rounded-md bg-background/60 p-2 text-xs text-muted-foreground">
              <code>{info.example}</code>
            </pre>
          )}
        </div>
      </details>
    </li>
  );
}

/** One dimension group: a collapsible block listing all its checks with status. */
function DimensionGroup({ dimension, defaultOpen }: { dimension: Dimension; defaultOpen: boolean }) {
  const checks = dimension.checks ?? [];
  return (
    <details className="group surface overflow-hidden" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">{dimension.label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {dimension.notApplicable ? "Not assessed" : `${dimension.score}/100`}
        </span>
        <span aria-hidden="true" className="ml-auto text-muted-foreground transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      {checks.length > 0 ? (
        <ul className="divide-y divide-border border-t border-border">
          {checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </ul>
      ) : (
        <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
          No individual criteria were recorded for this dimension.
        </p>
      )}
    </details>
  );
}

/**
 * "What we checked" - full transparency on every criterion Site IQ ran, with status.
 * Renders each dimension (in order) as a collapsible group, all open by default so every
 * criterion is visible at a glance; users can still collapse any group they don't need.
 */
export function WhatWeChecked({ dimensions }: { dimensions: Dimension[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">What we checked</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every criterion Site IQ runs, and how this site did. Deterministic rules - the score is computed from these.
      </p>
      <div className="mt-4 space-y-2.5">
        {dimensions.map((d) => (
          <DimensionGroup key={d.id} dimension={d} defaultOpen />
        ))}
      </div>
    </section>
  );
}
