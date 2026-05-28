/**
 * Site IQ scoring engine - pure, deterministic, unit-tested.
 *
 * Turns a flat list of CheckResults into per-dimension scores, an overall score
 * with a letter grade, and a prioritized action plan. Re-running with the same
 * checks always yields the same numbers (no randomness here).
 *
 * Rules implemented (see the audit rubric §6, §5.3):
 *  - dimension_score = 100 * Σ(weight·ratio) / Σ(weight) over APPLICABLE checks (N/A renormalized out)
 *  - overall = 0.30·SEO + 0.25·Tracking + 0.25·GEO + 0.20·Tech
 *  - critical-failure floor: a hard-failing critical check caps its dimension at 59 (max D),
 *    and caps the overall one grade below the weighted math.
 *  - action plan ranked by priority = impact·2 − effort, severity as tiebreaker.
 */

import type {
  ActionItem,
  AuditedPage,
  AuditResult,
  CheckResult,
  DimensionId,
  DimensionResult,
  FailedPage,
  Grade,
  Severity,
} from "./types";

/** Optional per-audit metadata stitched into the final AuditResult by scoreAudit. None of these
 *  affect the score - they are report metadata that the renderer uses to show the "Pages audited"
 *  list and the count of unreachable / filtered URLs. Defaulted to {} so existing callers (tests,
 *  parity, action-plan unit tests) compile unchanged. */
export interface AuditPageInfo {
  pages?: AuditedPage[];
  pagesWithIssues?: number;
  /** From the n8n PICK step's SENSITIVE_PATH_RE filter (Phase 2A). Surfaced as a count only -
   *  the paths themselves are never persisted, to avoid leaking admin / staging URLs in a shared
   *  report. */
  pagesExcluded?: number;
  /** Phase 2E: URLs that Firecrawl could not crawl successfully. Lets the report be honest about
   *  partial audits instead of silently auditing fewer pages than expected. */
  pagesFailed?: FailedPage[];
}

/** Overall weighting of the four dimensions (sums to 1). */
export const DIMENSION_WEIGHTS: Record<DimensionId, number> = {
  seo: 0.3,
  tracking: 0.25,
  geo: 0.25,
  tech: 0.2,
};

export const DIMENSION_LABELS: Record<DimensionId, string> = {
  seo: "SEO",
  tracking: "Tracking & Analytics",
  geo: "AI-Readiness (GEO)",
  tech: "Tech Basics",
};

/** Grade bands, highest first. */
const GRADE_BANDS: ReadonlyArray<{ grade: Grade; min: number }> = [
  { grade: "A", min: 90 },
  { grade: "B", min: 80 },
  { grade: "C", min: 70 },
  { grade: "D", min: 60 },
  { grade: "F", min: 0 },
];

const IMPACT_BY_SEVERITY: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Letter grade for a 0..100 score. */
export function gradeFor(score: number): Grade {
  return GRADE_BANDS.find((b) => score >= b.min)?.grade ?? "F";
}

/** Highest score that still lands one grade BELOW `grade` (used by the overall floor). */
function oneGradeLowerMax(grade: Grade): number {
  const band = GRADE_BANDS.find((b) => b.grade === grade);
  if (!band || band.grade === "F") return 0;
  return band.min - 1; // e.g. B (min 80) -> 79 (top of C)
}

function isCritical(c: CheckResult): boolean {
  return c.critical ?? c.severity === "critical";
}

/** Score one dimension from its checks (applies the critical-failure floor). */
export function scoreDimension(
  id: DimensionId,
  checks: CheckResult[],
): DimensionResult {
  const applicable = checks.filter((c) => c.ratio !== null);
  const totalWeight = applicable.reduce((sum, c) => sum + c.weight, 0);

  // Nothing assessable (every check N/A) -> the dimension is "not applicable": we could not verify
  // it at all (e.g. a crawl that can't see the site's tracking layer). Don't invent a score - mark
  // it Not assessed and let scoreAudit exclude it from the overall (renormalizing the weights).
  if (totalWeight === 0) {
    return {
      id,
      label: DIMENSION_LABELS[id],
      score: 0,
      rawScore: 0,
      capped: false,
      notApplicable: true,
      checks,
    };
  }

  const rawScore =
    (100 * applicable.reduce((sum, c) => sum + c.weight * (c.ratio as number), 0)) /
    totalWeight;

  // A hard-failing (ratio === 0) critical check caps the dimension at 59 (max grade D).
  const cappedBy = applicable
    .filter((c) => isCritical(c) && c.ratio === 0)
    .map((c) => c.id);
  const capped = cappedBy.length > 0;
  const score = capped ? Math.min(rawScore, 59) : rawScore;

  return {
    id,
    label: DIMENSION_LABELS[id],
    score: round1(score),
    rawScore: round1(rawScore),
    capped,
    cappedBy: capped ? cappedBy : undefined,
    checks,
  };
}

/** Build the prioritized action plan from failing/partial, applicable checks. */
export function buildActionPlan(checks: CheckResult[]): ActionItem[] {
  return checks
    .filter((c) => c.ratio !== null && (c.ratio as number) < 1)
    .map((c) => {
      const impact = c.impact ?? IMPACT_BY_SEVERITY[c.severity];
      const effort = c.effort ?? 3; // default: moderate
      return {
        checkId: c.id,
        finding: c.detail ?? c.label,
        impact,
        effort,
        priority: impact * 2 - effort,
        severity: c.severity,
        quickWin: impact >= 4 && effort <= 2,
        requiresApproval: c.dimension === "tracking",
      };
    })
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
    );
}

/** Full audit score: per-dimension + weighted overall + critical floor + action plan. */
export function scoreAudit(allChecks: CheckResult[], pageInfo: AuditPageInfo = {}): AuditResult {
  const dimensions = (Object.keys(DIMENSION_WEIGHTS) as DimensionId[]).map((id) =>
    scoreDimension(
      id,
      allChecks.filter((c) => c.dimension === id),
    ),
  );

  // Overall is the weighted average of the ASSESSABLE dimensions only - any "not applicable"
  // dimension (e.g. tracking we couldn't see) is excluded and its weight renormalized away, so it
  // neither helps nor hurts the grade.
  const scored = dimensions.filter((d) => !d.notApplicable);
  const weightSum = scored.reduce((sum, d) => sum + DIMENSION_WEIGHTS[d.id], 0);
  const overallMath =
    weightSum === 0
      ? 0
      : scored.reduce((sum, d) => sum + DIMENSION_WEIGHTS[d.id] * d.score, 0) / weightSum;

  // If any dimension was capped by a critical failure, drop the overall one grade
  // below whatever the weighted math produced (so a single critical issue can't
  // surface as an "A").
  const capped = dimensions.some((d) => d.capped);
  const mathGrade = gradeFor(overallMath);
  // Floor one grade below the math on a critical failure - but F is already the bottom.
  // Headline Site IQ score is an integer 0-100 (per-dimension scores keep their decimal).
  const overall = Math.round(
    capped && mathGrade !== "F"
      ? Math.min(overallMath, oneGradeLowerMax(mathGrade))
      : overallMath,
  );

  // Stitch in per-audit page metadata only when the caller passed it - keeps the AuditResult
  // payload identical to pre-Phase-2B for callers that do not opt in (the test suite, parity).
  const result: AuditResult = {
    overall, // already an integer (Math.round above); the headline score has no decimal
    grade: gradeFor(overall),
    capped,
    dimensions,
    actionPlan: buildActionPlan(allChecks),
  };
  if (pageInfo.pages !== undefined) result.pages = pageInfo.pages;
  if (pageInfo.pagesWithIssues !== undefined) result.pagesWithIssues = pageInfo.pagesWithIssues;
  if (pageInfo.pagesExcluded !== undefined) result.pagesExcluded = pageInfo.pagesExcluded;
  if (pageInfo.pagesFailed !== undefined) result.pagesFailed = pageInfo.pagesFailed;
  return result;
}
