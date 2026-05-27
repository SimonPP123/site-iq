import { describe, it, expect } from "vitest";
import { parseAuditResult, auditTriggerSchema, strictAuditResultSchema } from "./contract";
import type { AuditResult } from "./types";

// Typed as AuditResult, so TypeScript guarantees this fixture matches the engine's domain type;
// validating it against the schemas then proves the runtime contract tracks the type.
const sampleResult: AuditResult = {
  overall: 72,
  grade: "B",
  capped: false,
  dimensions: (["seo", "tracking", "geo", "tech"] as const).map((id) => ({
    id,
    label: id.toUpperCase(),
    score: 70,
    rawScore: 72,
    capped: false,
    checks: [{ id: "S4", label: "Indexable", dimension: id, weight: 10, severity: "medium", ratio: 1 }],
  })),
  actionPlan: [
    { checkId: "S4", finding: "Fix the noindex tag", impact: 4, effort: 2, priority: 6, severity: "high", quickWin: true, requiresApproval: false },
  ],
};

describe("parseAuditResult", () => {
  it("accepts a valid result object and preserves extra fields (summary, pagesSampled)", () => {
    const withExtras = { ...sampleResult, summary: "ok", pagesSampled: 8 };
    const r = parseAuditResult(withExtras);
    expect(r?.overall).toBe(72);
    expect((r as unknown as { summary?: string }).summary).toBe("ok");
  });
  it("accepts a double-encoded JSON string (Supabase jsonb)", () => {
    expect(parseAuditResult(JSON.stringify(sampleResult))?.grade).toBe("B");
  });
  it("returns null for non-JSON, wrong-shape, or null payloads", () => {
    expect(parseAuditResult("}{ not json")).toBeNull();
    expect(parseAuditResult({ foo: 1 })).toBeNull();
    expect(parseAuditResult(null)).toBeNull();
    expect(parseAuditResult({ overall: 1, dimensions: "nope", actionPlan: [] })).toBeNull();
  });
});

describe("audit contract schemas", () => {
  it("a valid engine-shaped result satisfies the strict envelope schema", () => {
    expect(strictAuditResultSchema.safeParse(sampleResult).success).toBe(true);
  });
  it("a result missing the grade fails the strict schema (drift guard)", () => {
    const { grade: _grade, ...bad } = sampleResult;
    expect(strictAuditResultSchema.safeParse(bad).success).toBe(false);
  });
  it("validates the app -> n8n trigger payload", () => {
    expect(
      auditTriggerSchema.safeParse({
        reportId: "11111111-1111-4111-8111-111111111111",
        rootUrl: "https://x.com",
        domain: "x.com",
      }).success,
    ).toBe(true);
    expect(auditTriggerSchema.safeParse({ reportId: "x", rootUrl: "no", domain: "" }).success).toBe(false);
  });
});
