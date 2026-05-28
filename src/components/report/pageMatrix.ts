/**
 * Inverse map for the per-page report view. The audit persists failures per CHECK
 * (CheckResult.evidence.failing[]); the "Pages audited" UI needs failures per PAGE.
 * This is a pure transformation - no I/O, no side effects, deterministic - so the
 * CrawledPagesSection component can render directly from existing AuditResult data
 * without persisting a duplicate "per-page" array (would bloat the result jsonb).
 *
 * NEVER widen this to look at fields the contract refine does not validate
 * (titles, content snippets, response headers). The audit's `failing[].path`
 * has structured-reason payloads only - keep the matrix value type narrow so
 * the renderer cannot accidentally surface raw page content.
 */

import type {
  AuditedPage,
  CheckEvidence,
  DimensionId,
  FailureReason,
  Severity,
} from "@/lib/audit/types";

/** One failed check on a specific page, projected from the inverse map. */
export interface PageFailure {
  checkId: string;
  checkLabel: string;
  dimensionId: DimensionId;
  severity: Severity;
  reason?: FailureReason;
}

/** path -> list of checks that failed on that page. Pages with no failures map to []. */
export type PageMatrix = Map<string, PageFailure[]>;

/** Slim per-check shape the matrix needs - subset of CheckResult so callers may pass the UI-side
 *  projection (Check) that ReportView uses, instead of the full engine-side CheckResult. `severity`
 *  is optional because the projection sometimes omits it; we default to "info" so the histogram
 *  still works on legacy data. */
export interface PageMatrixCheck {
  id: string;
  label: string;
  severity?: Severity;
  evidence?: CheckEvidence;
}

/** Slim per-dimension shape - dimension.id is read off the parent so the check itself does not need
 *  to carry `dimension` (the slim CheckResult projection omits it). */
export interface PageMatrixDimension {
  id: DimensionId;
  checks?: PageMatrixCheck[];
}

/**
 * Build the inverse map. Pages not in `pages` are dropped from failing[] entries (shouldn't happen
 * given the contract's mirror invariant, but a renderer crash from a dangling reference would be a
 * worse failure mode than a silently-skipped row).
 */
export function buildPageMatrix(
  pages: AuditedPage[] | undefined,
  dimensions: PageMatrixDimension[] | undefined,
): PageMatrix {
  const m: PageMatrix = new Map();
  if (!Array.isArray(pages)) return m;
  for (const p of pages) m.set(p.path, []);
  if (!Array.isArray(dimensions)) return m;
  for (const d of dimensions) {
    if (!Array.isArray(d.checks)) continue;
    for (const c of d.checks) {
      const failing = c.evidence?.failing;
      if (!Array.isArray(failing)) continue;
      for (const fp of failing) {
        if (!fp || typeof fp.path !== "string") continue;
        const arr = m.get(fp.path);
        if (!arr) continue; // path not in pages list - contract refine would have rejected this
        arr.push({
          checkId: c.id,
          checkLabel: c.label,
          dimensionId: d.id,                // parent dimension id (slim Check omits `dimension`)
          severity: c.severity ?? "info",   // default to lowest bucket if missing
          reason: fp.reason,
        });
      }
    }
  }
  return m;
}

/** Severity bucket for one page: the maximum severity of any check it failed, or "clean" for none.
 *  Used by the histogram badge ("3 critical, 1 high, 4 clean") so each page is counted exactly once. */
export type PageSeverity = Severity | "clean";

const SEVERITY_ORDER: readonly Severity[] = ["critical", "high", "medium", "low", "info"];

export function severityOfPage(failures: PageFailure[] | undefined): PageSeverity {
  if (!Array.isArray(failures) || failures.length === 0) return "clean";
  for (const s of SEVERITY_ORDER) {
    if (failures.some((f) => f.severity === s)) return s;
  }
  return "info"; // unreachable on well-typed input; fail-safe to lowest non-clean bucket
}

/** Histogram: how many of the audited pages fall in each severity bucket. Each page counted once
 *  by its `severityOfPage`. Helps the user scan "where the issues live" without expanding the list. */
export interface PageSeverityHistogram {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  clean: number;
}

export function pageSeverityHistogram(
  pages: AuditedPage[] | undefined,
  matrix: PageMatrix,
): PageSeverityHistogram {
  const h: PageSeverityHistogram = { critical: 0, high: 0, medium: 0, low: 0, info: 0, clean: 0 };
  if (!Array.isArray(pages)) return h;
  for (const p of pages) {
    const bucket = severityOfPage(matrix.get(p.path));
    h[bucket]++;
  }
  return h;
}
