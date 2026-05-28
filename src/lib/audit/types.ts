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
/**
 * Why a specific sampled page failed a check. Each kind is paired with the minimal data the UI needs
 * to render a precise sentence (and, later, filter / group / translate). Structured rather than a free
 * string so the same shape can be safely persisted, parity-tested across the TS engine and the n8n
 * port, and never leaks raw page content (titles, descriptions, response headers) that could carry
 * XSS or prompt-injection payloads. `other` is a transitional escape hatch for migrations.
 */
export type FailureReason =
  /** Content was found but too short for the rule's range (S1 title, S2 description, S10 content depth, ...). */
  | { kind: "too_short"; actual: number; min: number }
  /** Content was found but too long for the rule's range (S1 title, S2 description). */
  | { kind: "too_long"; actual: number; max: number }
  /** The required element is absent from the page entirely (S3 canonical, S12 OG, G1 JSON-LD, ...). */
  | { kind: "missing"; what: string }
  /** A robots/googlebot meta or X-Robots-Tag header sets `noindex` (S4). */
  | { kind: "noindex" }
  /** Page returned a non-OK HTTP status (S17). */
  | { kind: "http_status"; code: number }
  /** Page returned 200 but the body looks like a "not found" page (S17). */
  | { kind: "soft_404" }
  /** Page was fetched over plain HTTP, not HTTPS (TB1). */
  | { kind: "non_https" }
  /** Found N occurrences of something when 1 was expected (S5 multiple H1, S12 missing tag, ...). */
  | { kind: "wrong_count"; what: string; actual: number; expected: number }
  /** Cross-page mismatch (S23 canonical points elsewhere; S15/S16 duplicate of another page). */
  | { kind: "mismatch"; what: string; expected: string; actual: string }
  /** Free-text escape hatch for checks that have not yet been migrated to a structured kind, OR for
   *  rare aggregate findings where no single `kind` fits. Length-capped at the persistence layer. */
  | { kind: "other"; note: string };

/** One sampled page that did not pass a check, with the structured reason it failed. */
export interface FailingPage {
  /** Normalized path of the page (query + hash dropped, trailing slash trimmed). */
  path: string;
  /** Why this page failed. Structured so the UI can render precisely and i18n later.
   *  Optional: an `undefined` reason means "the check failed here, no further detail" - kept around
   *  so unmigrated checks can ship `failing: [{path}]` without reasons. */
  reason?: FailureReason;
}

export interface CheckEvidence {
  /**
   * One-line, human-readable label of the source the check examined, e.g.
   * "Across all 9 crawled pages", "The site's robots.txt", "The root URL's response headers",
   * or "Tag/script detection across all 9 crawled pages plus the GTM container".
   */
  where: string;
  /** Pages that did NOT pass - per-page checks only. De-duped by `path` (first-reason wins on collision);
   *  capped at 12 entries, with the overflow count in `more`. Each entry carries a structured reason
   *  (a `FailureReason` discriminated union) for that specific page so the report can show *what* went
   *  wrong, not just *which* URL was affected. */
  failing?: FailingPage[];
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

/**
 * One crawled page in the audit sample. Currently just the normalized path - the same one that
 * `evidence.failing[].path` uses, so the UI can build an inverse map "this page failed: S2, T7, G15".
 * Kept as an object (not a bare string) so we can add `sampled` / `status` later without a breaking
 * change to consumers (rejected Variant C in 2026-05-28 multi-agent review).
 */
export interface AuditedPage {
  /** Normalized path, matching what `CheckEvidence.failing[].path` uses (query/hash dropped,
   *  trailing slash trimmed, control chars stripped, capped at 200 bytes). */
  path: string;
}

export interface AuditResult {
  overall: number; // 0..100
  grade: Grade;
  capped: boolean; // a critical check failed somewhere
  dimensions: DimensionResult[];
  actionPlan: ActionItem[];
  /** All crawled pages in the sample (de-duped by normalized path). Lets the UI show WHICH pages
   *  were audited, not just the count. Optional so old reports (pre-Phase-2B) parse without churn -
   *  parseAuditResult is passthrough on extras. */
  pages?: AuditedPage[];
  /** Number of unique pages that failed at least one check. Computed at runChecks time from the
   *  FULL (pre-truncation) failing arrays - so a high `more` overflow on individual checks does not
   *  silently undercount. NEVER derive this from the truncated evidence.failing[] arrays. */
  pagesWithIssues?: number;
  /** Number of candidate URLs that the n8n PICK step filtered out by the SENSITIVE_PATH_RE deny-list
   *  (Phase 2A). Surfaced so the user understands why we audited 7 not 10. Paths themselves are NEVER
   *  persisted - only the count - so a shared report cannot leak admin / staging / customer URLs. */
  pagesExcluded?: number;
  /** Phase 2E: URLs that were submitted to Firecrawl (i.e. survived the SENSITIVE_PATH_RE filter)
   *  but did NOT return usable content. Paired with `pages` to give the user honesty about partial
   *  audits: "We audited 5 of 10. 3 pages could not be crawled (admin redirect / sitemap timeout /
   *  ...)". The path field is the same normalized form as `pages[].path`; the reason is a closed
   *  enum so the UI can render a precise sentence per case and stay i18n-friendly. */
  pagesFailed?: FailedPage[];
}

/** A submitted URL that Firecrawl could not turn into a usable page. */
export interface FailedPage {
  path: string;
  reason: FailedPageReason;
}

/**
 * Why a submitted URL failed to crawl. Closed enum so the contract refine validates it and the UI
 * can map each kind to a localized sentence. Kept narrow on purpose - more granular categorization
 * (e.g. specific HTTP codes, CDN block, robots disallow) belongs in Sentry breadcrumbs / logs, not
 * in the public report.
 */
export type FailedPageReason =
  /** Firecrawl returned 4xx for the page (commonly 403/404/410). */
  | "4xx"
  /** Firecrawl returned 5xx (server error). */
  | "5xx"
  /** The page came back from Firecrawl but had no html/markdown/metadata to score. */
  | "no-content"
  /** The URL was submitted but never appeared in the batch result (Firecrawl-side timeout / drop). */
  | "timeout";
