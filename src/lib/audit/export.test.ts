import { describe, it, expect } from "vitest";
import { buildExportModel, toMarkdown, toJson, failureReasonText } from "./export";
import type { AuditResult } from "./types";

const GEN = "2026-05-29T00:00:00.000Z";

function sampleResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    overall: 82,
    grade: "B",
    capped: false,
    dimensions: [
      {
        id: "seo",
        label: "SEO",
        score: 80,
        rawScore: 80,
        capped: false,
        checks: [
          { id: "S1", label: "Title tags", dimension: "seo", weight: 3, severity: "high", ratio: 1 },
          {
            id: "S2",
            label: "Meta descriptions",
            dimension: "seo",
            weight: 2,
            severity: "medium",
            ratio: 0,
            evidence: {
              where: "Across all 3 crawled pages",
              failing: [
                { path: "/about", reason: { kind: "too_short", actual: 40, min: 70 } },
                { path: "/contact", reason: { kind: "missing", what: "meta description" } },
              ],
              checked: 3,
              more: 1,
            },
          },
        ],
      },
      {
        id: "tracking",
        label: "Tracking",
        score: 0,
        rawScore: 0,
        capped: false,
        notApplicable: true,
        checks: [{ id: "T1", label: "GA4 present", dimension: "tracking", weight: 2, severity: "medium", ratio: null }],
      },
    ],
    actionPlan: [
      { checkId: "S2", finding: "Add meta descriptions to 2 pages", impact: 4, effort: 2, priority: 6, severity: "medium", quickWin: true, requiresApproval: false },
    ],
    pages: [{ path: "/" }, { path: "/about" }, { path: "/contact" }],
    pagesWithIssues: 2,
    pagesExcluded: 1,
    pagesFailed: [{ path: "/old", reason: "4xx" }],
    ...overrides,
  };
}

describe("buildExportModel", () => {
  it("joins the action plan with CHECK_INFO and surfaces failing pages + structured reasons", () => {
    const m = buildExportModel(sampleResult(), { domain: "example.com", generatedAt: GEN });
    expect(m.domain).toBe("example.com");
    expect(m.overall).toBe(82);
    expect(m.actionPlan).toHaveLength(1);
    const a = m.actionPlan[0];
    expect(a.checkId).toBe("S2");
    expect(a.rank).toBe(1);
    expect(a.why).toBeTruthy(); // pulled from CHECK_INFO[S2]
    expect(a.fix).toBeTruthy();
    expect(a.affectedPages).toEqual([
      { path: "/about", reason: "too short (40 < 70)" },
      { path: "/contact", reason: "missing meta description" },
    ]);
  });

  it("marks an all-N/A dimension as not assessed (null score)", () => {
    const m = buildExportModel(sampleResult(), { domain: "x.com", generatedAt: GEN });
    const tracking = m.dimensions.find((d) => d.id === "tracking")!;
    expect(tracking.notApplicable).toBe(true);
    expect(tracking.score).toBeNull();
    const seo = m.dimensions.find((d) => d.id === "seo")!;
    expect(seo.checks.find((c) => c.id === "S2")!.status).toBe("fail");
    expect(seo.checks.find((c) => c.id === "S1")!.status).toBe("pass");
  });

  it("survives a minimal / degraded result missing the arrays", () => {
    const m = buildExportModel({ overall: 50, grade: "C", capped: false } as unknown as AuditResult, { domain: "x.com", generatedAt: GEN });
    expect(m.dimensions).toEqual([]);
    expect(m.actionPlan).toEqual([]);
    expect(m.overall).toBe(50);
  });
});

describe("toMarkdown", () => {
  it("renders header, dimension scores, action plan, check results and coverage", () => {
    const md = toMarkdown(buildExportModel(sampleResult(), { domain: "example.com", generatedAt: GEN }));
    expect(md).toContain("# Site IQ audit - example.com");
    expect(md).toContain("Overall score: 82/100 (grade B)");
    expect(md).toContain("| SEO | 80/100 |");
    expect(md).toContain("Not assessed"); // the N/A tracking dimension
    expect(md).toContain("[FAIL] S2 Meta descriptions");
    expect(md).toContain("/about (too short (40 < 70))");
    expect(md).toContain("Could not crawl /old: returned a 4xx error");
    expect(md).toContain("(+1 more)"); // S2 evidence.more === 1 must surface, not be silently dropped
  });

  it("does not throw on a dimension missing its checks array (degraded n8n payload)", () => {
    const r = {
      overall: 40,
      grade: "D",
      capped: false,
      dimensions: [{ id: "seo", label: "SEO", score: 40, rawScore: 40, capped: false }],
      actionPlan: [],
    } as unknown as AuditResult;
    expect(() => toMarkdown(buildExportModel(r, { domain: "x.com", generatedAt: GEN }))).not.toThrow();
  });

  it("states that nothing needs fixing when the action plan is empty", () => {
    const md = toMarkdown(buildExportModel(sampleResult({ actionPlan: [] }), { domain: "x.com", generatedAt: GEN }));
    expect(md).toContain("No issues found");
  });
});

describe("toJson", () => {
  it("produces valid JSON that round-trips the model", () => {
    const m = buildExportModel(sampleResult(), { domain: "x.com", generatedAt: GEN });
    expect(JSON.parse(toJson(m))).toEqual(m);
  });
});

describe("failureReasonText", () => {
  it("renders each structured reason kind and undefined for none", () => {
    expect(failureReasonText({ kind: "too_short", actual: 1, min: 2 })).toBe("too short (1 < 2)");
    expect(failureReasonText({ kind: "missing", what: "canonical" })).toBe("missing canonical");
    expect(failureReasonText({ kind: "http_status", code: 404 })).toBe("returned HTTP 404");
    expect(failureReasonText({ kind: "noindex" })).toBe("set to noindex");
    expect(failureReasonText(undefined)).toBeUndefined();
  });
});
