import { runChecks } from "./checks";
import { DIMENSION_WEIGHTS } from "./scoring";
import type { CheckResult } from "./types";

/**
 * The public methodology rubric, DERIVED FROM THE AUDIT ENGINE.
 *
 * runChecks([], "") enumerates all checks with their real id, dimension, weight, and severity (an
 * empty crawl still runs every check). The /methodology page renders straight from this, so the
 * "radical transparency" table can never drift from how the score is actually computed - the bug
 * where a hand-maintained copy showed a stale weight is now structurally impossible.
 *
 * Only the human-readable prose (dimension names, what each measures, and a few longer check
 * descriptions) is curated here; every number comes from the engine.
 */
export type RubricCheck = {
  id: string;
  check: string;
  severity: CheckResult["severity"];
  weight: number;
};

export type RubricDimension = {
  key: CheckResult["dimension"];
  name: string;
  weight: number; // percent of the overall score (from DIMENSION_WEIGHTS)
  measures: string;
  checks: RubricCheck[];
};

// Longer display descriptions for a handful of checks - PROSE ONLY. Falls back to the engine's own
// label. Weight/severity/dimension are never taken from here.
const DESCRIPTIONS: Record<string, string> = {
  S10: "Content depth (>= 300 words)",
  S15: "Unique page titles (cross-page)",
  S16: "Unique meta descriptions (cross-page)",
  T1: "Analytics present (GA4 or privacy-first)",
  T2: "No legacy Universal Analytics (UA- / analytics.js)",
  T5: "Consent Mode present (v1)",
  T8: "Ad / social pixels",
  G4: "Direct-answer opening (lead sentence)",
  G9: "AI crawlers not blocked in robots.txt",
  G11: "Typed schema entities (Org/Article/Product/FAQ...)",
  TB10: "Charset & language declared",
};

const DIMENSION_META: Record<CheckResult["dimension"], { name: string; measures: string }> = {
  seo: { name: "SEO", measures: "Can search engines find, understand, and rank the pages?" },
  tracking: {
    name: "Tracking & Analytics",
    measures: "Is measurement present and consent / privacy handled (GA4, Consent Mode v2, CMP)?",
  },
  geo: {
    name: "AI-Readiness (GEO)",
    measures: "Can AI answer-engines read and cite the content (schema, SSR, AI-crawler access)?",
  },
  tech: {
    name: "Tech Basics",
    measures:
      "HTTPS, crawlability, mobile, static performance hygiene, and security response headers (HSTS, CSP, X-Frame-Options).",
  },
};

const ENGINE_CHECKS = runChecks([], "");
const ORDER: CheckResult["dimension"][] = ["seo", "tracking", "geo", "tech"];

export const DIMENSIONS: RubricDimension[] = ORDER.map((key) => ({
  key,
  name: DIMENSION_META[key].name,
  weight: Math.round(DIMENSION_WEIGHTS[key] * 100),
  measures: DIMENSION_META[key].measures,
  checks: ENGINE_CHECKS.filter((c) => c.dimension === key).map((c) => ({
    id: c.id,
    check: DESCRIPTIONS[c.id] ?? c.label,
    severity: c.severity,
    weight: c.weight,
  })),
}));

export const TOTAL_CHECKS = ENGINE_CHECKS.length;
