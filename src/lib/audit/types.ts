/**
 * Domain types for the Site IQ audit.
 *
 * The audit is fully deterministic: a set of rule-based CHECKS run over crawled
 * pages (no LLM), each producing a 0..1 ratio. The scoring engine (scoring.ts)
 * turns those into per-dimension and overall 0..100 scores + an action plan.
 * The LLM only writes the prose summary afterwards, never the numbers.
 *
 * Spec: docs/SITE-IQ-SPEC.md and the audit rubric (SEO / Tracking / GEO / Tech).
 */

/** A page as returned by Firecrawl's /scrape (the fields the checks read). */
export interface CrawledPage {
  markdown?: string;
  html?: string; // rendered/main-content HTML
  rawHtml?: string; // unprocessed source (head scripts etc.)
  links?: string[];
  metadata?: {
    title?: string;
    description?: string;
    sourceURL?: string;
    statusCode?: number;
    language?: string;
  };
}

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type DimensionId = "seo" | "tracking" | "geo" | "tech";

/**
 * Where a check looked, and (for per-page checks) which sampled pages failed it. This is purely
 * additive report metadata for the "What we checked" panel - it NEVER affects the score. It has to
 * be computed during the n8n run (the crawled pages carry metadata.sourceURL) and persisted in the
 * result, because the page URLs are not otherwise stored.
 */
export interface CheckEvidence {
  /**
   * One-line, human-readable label of the source the check examined, e.g.
   * "Across all 9 crawled pages", "The site's robots.txt", "The root URL's response headers",
   * or "Tag/script detection across all 9 crawled pages plus the GTM container".
   */
  where: string;
  /** Page paths (e.g. "/about") that did NOT pass - per-page checks only. Capped; see `more`. */
  failing?: string[];
  /** Number of sampled pages the check examined (per-page checks only). */
  checked?: number;
  /** Failing pages omitted beyond the `failing` cap (so the UI can say "+N more"). */
  more?: number;
}

/**
 * Result of a single deterministic check.
 * `ratio`: 1 = pass, 0 = fail, 0..1 = partial/coverage, `null` = not applicable (N/A).
 * N/A checks are excluded from scoring (their weight is renormalized away) so a site
 * is never penalized for an inapplicable check (e.g. hreflang on a mono-locale site).
 */
export interface CheckResult {
  id: string; // rubric id, e.g. "S4", "T5", "G2", "TB1"
  label: string;
  dimension: DimensionId;
  weight: number; // relative weight within a dimension (NOT normalized to 100; scoring.ts renormalizes)
  severity: Severity;
  ratio: number | null;
  /** A failing critical check triggers the floor. Defaults to `severity === "critical"`. */
  critical?: boolean;
  /** Optional human-readable evidence (becomes the action-plan finding). */
  detail?: string;
  /** Where the check looked + which pages failed (report metadata only; never affects scoring). */
  evidence?: CheckEvidence;
  /** Optional Impact/Effort overrides for the action plan (1..5). */
  impact?: number;
  effort?: number;
}

export interface DimensionResult {
  id: DimensionId;
  label: string;
  /** 0..100 after the critical-failure floor. */
  score: number;
  /** 0..100 before the floor (for transparency in the report). */
  rawScore: number;
  /** True if the critical-failure floor capped this dimension. */
  capped: boolean;
  /** Check ids that triggered the cap. */
  cappedBy?: string[];
  /**
   * True when EVERY check in the dimension was N/A (nothing was assessable - e.g. a crawl that
   * could not see the site's tracking layer at all). Such a dimension is shown as "Not assessed"
   * and is EXCLUDED from the overall score (the remaining dimension weights are renormalized), so
   * we never invent a score - low OR high - for something we could not verify.
   */
  notApplicable?: boolean;
  checks: CheckResult[];
}

export interface ActionItem {
  checkId: string;
  finding: string;
  impact: number; // 1..5
  effort: number; // 1..5
  priority: number; // (impact * 2) - effort; higher = do sooner
  severity: Severity;
  quickWin: boolean; // impact >= 4 && effort <= 2
  requiresApproval: boolean; // tracking/GTM changes need client sign-off
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface AuditResult {
  overall: number; // 0..100
  grade: Grade;
  capped: boolean; // a critical check failed somewhere
  dimensions: DimensionResult[];
  actionPlan: ActionItem[];
}
