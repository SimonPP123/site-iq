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
  const parsed = minimalAuditResultSchema.safeParse(obj);
  if (!parsed.success) {
    console.error("[contract] audit result failed validation:", parsed.error.issues[0]?.message);
    return null;
  }
  // The invariants the UI needs are validated; the value carries the full (passthrough) object,
  // including extras (summary, pagesSampled, ...). The cast is now AFTER validation, not before.
  return parsed.data as unknown as AuditResult;
}

/** The app -> n8n audit trigger payload. Documents the outbound contract; used by the contract test. */
export const auditTriggerSchema = z.object({
  reportId: z.string().uuid(),
  rootUrl: z.string().url(),
  domain: z.string().min(1),
});

/**
 * Stricter schema for the contract test: asserts the engine's own output shape (overall/grade/
 * capped/dimensions/actionPlan) does not drift from what the app + n8n port expect. Permissive on
 * extra fields and on the inner check/action objects so it tracks the envelope, not every detail.
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
  })
  .passthrough();
