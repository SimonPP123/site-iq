import { describe, it, expect } from "vitest";
import {
  buildPageMatrix,
  pageSeverityHistogram,
  severityOfPage,
  type PageMatrixDimension,
} from "./pageMatrix";

/**
 * Tests for the inverse-map helper that CrawledPagesSection renders from. Pure logic, no React,
 * runs under vitest like the engine tests. Covers the silent-failure-hunter checklist for Phase 2C:
 *  - severity bucket per page (max-wins)
 *  - path NOT in pages list is dropped (defensive, contract-refine should already prevent it)
 *  - missing `severity` on a check defaults to "info" (legacy reports, demo fixtures)
 *  - histogram counts each page once, NOT once per failing check (the deduping guarantee that the
 *    runChecks pagesWithIssues rollup gives us is preserved in the UI projection)
 *  - empty/undefined input is a no-op (no crashes on a still-loading report)
 */

const dim = (
  id: "seo" | "tracking" | "geo" | "tech",
  checks: PageMatrixDimension["checks"],
): PageMatrixDimension => ({ id, checks });

describe("buildPageMatrix", () => {
  it("seeds every page with an empty failure list (so the renderer can count clean pages)", () => {
    const m = buildPageMatrix([{ path: "/" }, { path: "/about" }], []);
    expect(m.get("/")).toEqual([]);
    expect(m.get("/about")).toEqual([]);
  });

  it("collects failures from evidence.failing[].path into the matrix, preserving check id/label/severity", () => {
    const m = buildPageMatrix(
      [{ path: "/" }, { path: "/about" }],
      [
        dim("seo", [
          {
            id: "S1",
            label: "Title length",
            severity: "high",
            evidence: { where: "x", failing: [{ path: "/about", reason: { kind: "too_short", actual: 4, min: 15 } }] },
          },
        ]),
      ],
    );
    expect(m.get("/")).toEqual([]);
    expect(m.get("/about")).toEqual([
      {
        checkId: "S1",
        checkLabel: "Title length",
        dimensionId: "seo",
        severity: "high",
        reason: { kind: "too_short", actual: 4, min: 15 },
      },
    ]);
  });

  it("drops failing paths that are not in the pages list (dangling-reference guard)", () => {
    const m = buildPageMatrix(
      [{ path: "/" }],
      [dim("seo", [{ id: "S1", label: "x", severity: "high", evidence: { failing: [{ path: "/ghost" }], where: "x" } }])],
    );
    expect(m.get("/ghost")).toBeUndefined();
    expect(m.get("/")).toEqual([]);
  });

  it("preserves the producer's severity verbatim (no silent default)", () => {
    // Severity is now required on PageMatrixCheck (commit aligned with the multi-agent
    // type-analyzer's recommendation: migrate the fixture, drop the `?? \"info\"` fallback).
    // The matrix forwards what the producer gave - if a check has severity \"critical\", that's
    // what the histogram sees; if a future producer drift drops severity entirely, TS errors at
    // build time instead of the renderer silently bucketing into \"Low\".
    const m = buildPageMatrix(
      [{ path: "/" }],
      [dim("seo", [{ id: "S1", label: "x", severity: "critical", evidence: { failing: [{ path: "/" }], where: "x" } }])],
    );
    expect(m.get("/")?.[0]?.severity).toBe("critical");
  });

  it("handles missing/undefined inputs without throwing", () => {
    expect(buildPageMatrix(undefined, undefined).size).toBe(0);
    expect(buildPageMatrix([], undefined).size).toBe(0);
    expect(buildPageMatrix(undefined, []).size).toBe(0);
  });
});

describe("severityOfPage", () => {
  it("returns 'clean' when the failure list is empty", () => {
    expect(severityOfPage([])).toBe("clean");
    expect(severityOfPage(undefined)).toBe("clean");
  });
  it("returns the max severity present (critical > high > medium > low > info)", () => {
    expect(
      severityOfPage([
        { checkId: "a", checkLabel: "a", dimensionId: "seo", severity: "low" },
        { checkId: "b", checkLabel: "b", dimensionId: "seo", severity: "critical" },
        { checkId: "c", checkLabel: "c", dimensionId: "seo", severity: "medium" },
      ]),
    ).toBe("critical");
  });
});

describe("pageSeverityHistogram", () => {
  it("counts each page exactly once into its max-severity bucket (NOT per failing check)", () => {
    const pages = [{ path: "/" }, { path: "/a" }, { path: "/b" }];
    const dims: PageMatrixDimension[] = [
      dim("seo", [
        {
          id: "S1",
          label: "x",
          severity: "high",
          evidence: { failing: [{ path: "/a" }, { path: "/b" }], where: "x" },
        },
        {
          id: "S2",
          label: "y",
          severity: "critical",
          evidence: { failing: [{ path: "/a" }], where: "y" }, // /a now has critical + high; counted once as critical
        },
      ]),
    ];
    const m = buildPageMatrix(pages, dims);
    const h = pageSeverityHistogram(pages, m);
    expect(h).toEqual({ critical: 1, high: 1, medium: 0, low: 0, info: 0, clean: 1 });
    // /a -> 2 failures but bucketed once into critical; /b -> 1 failure in high; / -> 0 failures (clean).
  });

  it("returns all-zero histogram on undefined pages (no-op for loading state)", () => {
    expect(pageSeverityHistogram(undefined, new Map())).toEqual({
      critical: 0, high: 0, medium: 0, low: 0, info: 0, clean: 0,
    });
  });
});
