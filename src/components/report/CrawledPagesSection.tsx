"use client";

import { useMemo, useState } from "react";
import type { AuditedPage } from "@/lib/audit/types";
import {
  buildPageMatrix,
  pageSeverityHistogram,
  severityOfPage,
  type PageMatrixDimension,
  type PageSeverity,
} from "./pageMatrix";

/**
 * "Pages audited" section. Collapsed by default per the multi-agent UX hybrid: the header carries
 * the page count + a severity histogram so a casual reader sees "where the issues live" without
 * exposing the full path list to a screenshot. Expanding reveals one row per page with a per-page
 * severity badge + issue count - intentionally no titles/snippets (would multiply persistence and
 * is an XSS vector for raw page content; the data we have is paths + the structured-reason failures
 * already vetted by the contract refine).
 *
 * Renders nothing if `pages` is missing - old reports (pre-Phase-2B) parse with the field absent.
 */
export function CrawledPagesSection({
  pages,
  pagesWithIssues,
  pagesExcluded,
  dimensions,
}: {
  pages: AuditedPage[] | undefined;
  pagesWithIssues: number | undefined;
  pagesExcluded: number | undefined;
  dimensions: PageMatrixDimension[];
}) {
  const [expanded, setExpanded] = useState(false);
  // useMemo - the inverse map is O(checks * failing) per render; cheap on 8-10 pages today but
  // the cost climbs with MAX_PAGES (Pro tier) and the matrix is re-keyed on the same identity
  // until result changes. Keep the calc out of the render hot path.
  const matrix = useMemo(() => buildPageMatrix(pages, dimensions), [pages, dimensions]);
  const histogram = useMemo(() => pageSeverityHistogram(pages, matrix), [pages, matrix]);

  if (!Array.isArray(pages) || pages.length === 0) return null;

  const count = pages.length;
  const totalIssues = pagesWithIssues ?? histogram.critical + histogram.high + histogram.medium + histogram.low + histogram.info;

  return (
    <section className="surface mt-6 p-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="crawled-pages-list"
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="flex-1">
          <h2 className="text-lg font-semibold">
            Pages audited <span className="text-muted-foreground/70 tabular-nums">({count})</span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalIssues > 0
              ? `${totalIssues} of ${count} ${count === 1 ? "page has" : "pages have"} at least one issue.`
              : `All ${count} ${count === 1 ? "page passed" : "pages passed"} every per-page check.`}
          </p>
          <SeverityHistogram h={histogram} />
        </div>
        <span
          aria-hidden
          className={`select-none text-sm text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {expanded && (
        <div id="crawled-pages-list" className="mt-5">
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {pages.map((p) => {
              const failures = matrix.get(p.path) ?? [];
              const sev = severityOfPage(failures);
              return (
                <li
                  key={p.path}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <code className="min-w-0 flex-1 truncate font-mono text-xs sm:text-sm">{p.path}</code>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {failures.length === 0
                      ? "0 issues"
                      : `${failures.length} ${failures.length === 1 ? "issue" : "issues"}`}
                  </span>
                  <SeverityPill sev={sev} />
                </li>
              );
            })}
          </ul>

          {typeof pagesExcluded === "number" && pagesExcluded > 0 && (
            <p className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="font-medium">+{pagesExcluded} {pagesExcluded === 1 ? "page was" : "pages were"} skipped.</span>{" "}
              Their URLs matched a sensitive-path pattern (admin / login / dashboard / staging /
              checkout / account). We never store these paths - the count is shown so the audit
              sample is transparent, not silently shorter than expected.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Inline severity histogram pills - one per non-zero bucket. */
function SeverityHistogram({ h }: { h: ReturnType<typeof pageSeverityHistogram> }) {
  const buckets: Array<[PageSeverity, number, string]> = [
    ["critical", h.critical, "Critical"],
    ["high", h.high, "High"],
    ["medium", h.medium, "Medium"],
    ["low", h.low + h.info, "Low"], // collapse `info` into "low" - users do not distinguish these
    ["clean", h.clean, "Clean"],
  ];
  const visible = buckets.filter(([, n]) => n > 0);
  if (visible.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Pages by severity">
      {visible.map(([sev, n, label]) => (
        <span
          key={sev}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums ${SEV_PILL_CLS[sev]}`}
        >
          <span className="font-medium">{n}</span>
          <span className="opacity-80">{label}</span>
        </span>
      ))}
    </div>
  );
}

function SeverityPill({ sev }: { sev: PageSeverity }) {
  const label = SEV_LABEL[sev];
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${SEV_PILL_CLS[sev]}`}
      aria-label={`Severity: ${label}`}
    >
      {label}
    </span>
  );
}

const SEV_LABEL: Record<PageSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Low",
  clean: "Clean",
};

// Pill classes mirror the existing SEV_COLOR/SEV_HEX palette in ReportView.tsx so the visual
// language stays consistent across the report (critical=red, high=orange, etc.).
const SEV_PILL_CLS: Record<PageSeverity, string> = {
  critical: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-zinc-500/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
  info: "border-zinc-500/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
  clean: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};
