import { z } from "zod";
import type { AuditResult } from "./types";

/**
 * Runtime contract for the audit `result` payload that the n8n workflow writes to Supabase and the
 * app reads back. n8n is a separate, externally-hosted system, so we never blindly `as`-cast its
 * JSON: a workflow bug or schema change could otherwise crash the report view
 * (result.dimensions.map(...)) or silently blank the chat scorecard.
 *
 * We validate the MINIMAL invariants the UI relies on (a numeric overall + dimensions/actionPlan
 * arrays) and keep every extra field (passthrough: the real payload also carries summary,
 * summaryStatus, pagesSampled, pagesAttempted), so we catch genuinely-malformed payloads without
 * ever rejecting a valid result that carries extra fields.
 */
const minimalAuditResultSchema = z
  .object({
    overall: z.number(),
    dimensions: z.array(z.unknown()),
    actionPlan: z.array(z.unknown()),
  })
  .passthrough();

/**
 * Parse + validate a `result` value (a JSON string OR an already-parsed object) into an AuditResult.
 * Returns null when the payload is missing the shape the UI depends on, so callers can degrade
 * gracefully (show "result unavailable") instead of crashing.
 *
 * Two-tier validation strategy (Phase 2B+ production hardening):
 *   1. Try the STRICT schema (mirror invariant `failing.path ⊆ pages.path`, closed
 *      `pagesFailed.reason` enum, control-char-free path lengths). On success, the value passes
 *      every contract assertion the test suite uses.
 *   2. On strict failure, fall back to the MINIMAL schema (just the keys the UI maps over) and
 *      log to Sentry so the workflow drift surfaces in production telemetry instead of silently
 *      under-counting pages, dropping orphan failing entries, or rendering an "info"-defaulted
 *      severity that should have been "critical". The renderer continues with degraded confidence;
 *      the engineer fixes the workflow upstream the next morning.
 *
 * The degrade path is critical: if strict-only, ANY workflow drift would blank the entire report
 * (the user thinks the audit broke). Two-tier keeps the UX promise while still emitting the alert.
 */
export function parseAuditResult(raw: unknown): AuditResult | null {
  if (raw === null || raw === undefined) return null;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      console.error("[contract] audit result is not valid JSON");
      return null;
    }
  }
  // Try strict first. On a permissive payload (no `pages`, old report) the strict schema still
  // accepts via the .optional() fields - it only adds rules WHEN those fields are present.
  const strict = strictAuditResultSchema.safeParse(obj);
  if (strict.success) return strict.data as unknown as AuditResult;
  // Strict failed. Log the first issue (don't spam) so production telemetry sees the drift.
  // Lazy Sentry import keeps the contract module free of a hard @sentry/nextjs dep at parse time
  // (parseAuditResult runs server-side, client-side, and during tests - Sentry's only available
  // when the runtime opted in by initializing the SDK).
  const firstIssue = strict.error.issues[0];
  const issueMsg = firstIssue?.message ?? "unknown strict-schema violation";
  const issuePath = firstIssue?.path?.join(".") ?? "";
  console.warn(`[contract] strict validation failed at ${issuePath}: ${issueMsg}`);
  if (typeof window === "undefined" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    // Server-side: Sentry is available via @sentry/nextjs server config.
    void import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.captureMessage("[contract] strict audit result validation failed", {
          level: "warning",
          extra: { issue: issueMsg, issuePath },
        });
      })
      .catch(() => {
        // Sentry not initialized in this runtime - the console.warn above is the only signal.
      });
  }
  // Degrade to minimal: accept the payload if it at least has the keys the UI maps over.
  const minimal = minimalAuditResultSchema.safeParse(obj);
  if (!minimal.success) {
    console.error("[contract] audit result failed validation:", minimal.error.issues[0]?.message);
    return null;
  }
  return minimal.data as unknown as AuditResult;
}

/** The app -> n8n audit trigger payload. Documents the outbound contract; used by the contract test. */
export const auditTriggerSchema = z.object({
  reportId: z.string().uuid(),
  rootUrl: z.string().url(),
  domain: z.string().min(1),
});

/**
 * Path-shape constraint applied to every per-page URL persisted into AuditResult: rejects ASCII
 * control chars (\x00-\x1F, \x7F), Unicode directional-formatting overrides (U+200E/F, U+202A-E,
 * U+2066-9), zero-width chars (U+200B-D, U+FEFF) and word-joiner (U+2060). The producer (n8n's
 * `pathOf`) already strips \x00-\x1F\x7F (Phase 2A), but a malicious crawl target could redirect
 * through a URL containing an RTL override (U+202E) that would render `/admin` in the report when
 * the actual path is something benign - or vice versa, fool the user into thinking they audited
 * their admin area. Defense-in-depth: bounce these at the validation boundary so neither n8n drift
 * nor a server-supplied redirect chain can plant them in the persisted result jsonb.
 */
// Reject ASCII control (0x00-0x1F), DEL (0x7F), zero-width / direction marks (U+200B-U+200F),
// bidi overrides (U+202A-U+202E), word-joiner + isolates (U+2060-U+2069), BOM (U+FEFF). Built via
// RegExp constructor + String.fromCharCode so the source is unambiguous (no invisible characters in
// the literal regex - those break grep and code-review tools).
const UNSAFE_PATH_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x1f],
  [0x7f, 0x7f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2069],
  [0xfeff, 0xfeff],
];
const UNSAFE_PATH_RE = new RegExp(
  "[" +
    UNSAFE_PATH_RANGES.map(([a, b]) => {
      const lo = "\\u" + a.toString(16).padStart(4, "0");
      const hi = "\\u" + b.toString(16).padStart(4, "0");
      return a === b ? lo : lo + "-" + hi;
    }).join("") +
    "]",
);
const safePathSchema = z
  .string()
  .min(1)
  .max(250)
  .refine((s) => !UNSAFE_PATH_RE.test(s), {
    message: "path contains control or directional-formatting characters",
  });

/**
 * Stricter schema for the contract test: asserts the engine's own output shape (overall/grade/
 * capped/dimensions/actionPlan) does not drift from what the app + n8n port expect. Permissive on
 * extra fields and on the inner check/action objects so it tracks the envelope, not every detail.
 *
 * Optional `pages` / `pagesWithIssues` / `pagesExcluded` (Phase 2B): a `.superRefine` enforces the
 * mirror invariant "every failing.path is a known page path" so a renderer that joins the two lists
 * (CrawledPagesSection's inverse map) never has to handle a dangling reference. Old reports without
 * `pages` skip the check.
 */
export const strictAuditResultSchema = z
  .object({
    overall: z.number().min(0).max(100),
    grade: z.enum(["A", "B", "C", "D", "F"]),
    capped: z.boolean(),
    dimensions: z
      .array(
        z
          .object({
            id: z.enum(["seo", "tracking", "geo", "tech"]),
            label: z.string(),
            score: z.number(),
            rawScore: z.number(),
            capped: z.boolean(),
            checks: z.array(z.object({ id: z.string(), ratio: z.number().nullable() }).passthrough()),
          })
          .passthrough(),
      )
      .length(4),
    actionPlan: z.array(
      z.object({ checkId: z.string(), finding: z.string(), severity: z.string() }).passthrough(),
    ),
    pages: z.array(z.object({ path: safePathSchema }).passthrough()).optional(),
    pagesWithIssues: z.number().int().min(0).optional(),
    pagesExcluded: z.number().int().min(0).optional(),
    // Phase 2E: URLs Firecrawl tried but couldn't turn into a usable page. The reason is a closed
    // enum so the UI can render a precise sentence ("4xx", "5xx", "no content", "timeout").
    pagesFailed: z
      .array(
        z.object({
          path: safePathSchema,
          reason: z.enum(["4xx", "5xx", "no-content", "timeout"]),
        }),
      )
      .optional(),
  })
  .passthrough()
  .superRefine((r, ctx) => {
    // Mirror invariant: when the report carries a `pages` list, every failing.path referenced by an
    // evidence block must be in it. If this drifts, the UI's inverse map (path -> failing checks)
    // ends up with orphan references and either crashes or silently swallows pages. Caught here so
    // it surfaces as a contract test failure, not a production rendering bug.
    if (!r.pages) return;
    const known = new Set(r.pages.map((p) => p.path));
    for (const d of r.dimensions) {
      const checks = (d as { checks?: Array<{ id?: string; evidence?: { failing?: Array<{ path?: string }> } }> }).checks ?? [];
      for (const c of checks) {
        const failing = c.evidence?.failing;
        if (!Array.isArray(failing)) continue;
        for (const fp of failing) {
          const p = fp?.path;
          if (typeof p === "string" && !known.has(p)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["dimensions", d.id ?? "?", "checks", c.id ?? "?", "evidence", "failing", "path"],
              message: `failing.path "${p}" is not in result.pages`,
            });
            return; // first violation is enough; don't spam every check.
          }
        }
      }
    }
  });
