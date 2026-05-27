import { describe, it, expect } from "vitest";
import {
  gradeFor,
  scoreDimension,
  scoreAudit,
  buildActionPlan,
} from "./scoring";
import type { CheckResult } from "./types";

/** Test helper: a passing SEO check, overridable. */
const check = (over: Partial<CheckResult>): CheckResult => ({
  id: "X",
  label: "x",
  dimension: "seo",
  weight: 10,
  severity: "medium",
  ratio: 1,
  ...over,
});

describe("gradeFor", () => {
  it("maps scores to bands", () => {
    expect(gradeFor(100)).toBe("A");
    expect(gradeFor(90)).toBe("A");
    expect(gradeFor(89)).toBe("B");
    expect(gradeFor(70)).toBe("C");
    expect(gradeFor(60)).toBe("D");
    expect(gradeFor(59)).toBe("F");
    expect(gradeFor(0)).toBe("F");
  });
});

describe("scoreDimension", () => {
  it("computes the weighted ratio as 0..100", () => {
    const d = scoreDimension("seo", [
      check({ weight: 50, ratio: 1 }),
      check({ weight: 50, ratio: 0 }),
    ]);
    expect(d.score).toBe(50);
    expect(d.capped).toBe(false);
  });

  it("renormalizes N/A checks so they never penalize", () => {
    const d = scoreDimension("seo", [
      check({ weight: 90, ratio: 1 }),
      check({ id: "NA", weight: 10, ratio: null }), // not applicable
    ]);
    expect(d.score).toBe(100);
  });

  it("marks an all-N/A dimension as notApplicable (not a fake 100)", () => {
    const d = scoreDimension("tracking", [
      check({ dimension: "tracking", ratio: null }),
      check({ dimension: "tracking", ratio: null }),
    ]);
    expect(d.notApplicable).toBe(true);
    expect(d.score).toBe(0);
  });

  it("honors partial ratios", () => {
    const d = scoreDimension("tracking", [
      check({ dimension: "tracking", weight: 100, ratio: 0.5, severity: "high" }),
    ]);
    expect(d.score).toBe(50);
  });

  it("applies the critical-failure floor (caps at 59)", () => {
    const d = scoreDimension("seo", [
      check({ weight: 90, ratio: 1 }),
      check({ id: "S4", weight: 10, ratio: 0, severity: "critical" }), // noindex etc.
    ]);
    expect(d.rawScore).toBe(90);
    expect(d.score).toBe(59);
    expect(d.capped).toBe(true);
    expect(d.cappedBy).toEqual(["S4"]);
  });

  it("does NOT floor on a partial critical (only hard fail = ratio 0)", () => {
    const d = scoreDimension("tracking", [
      check({ id: "T5", dimension: "tracking", weight: 100, ratio: 0.5, severity: "critical" }),
    ]);
    expect(d.capped).toBe(false);
    expect(d.score).toBe(50);
  });
});

describe("scoreAudit", () => {
  it("weights the four dimensions", () => {
    const r = scoreAudit([
      check({ dimension: "seo", weight: 100, ratio: 1 }),
      check({ dimension: "tracking", weight: 100, ratio: 1 }),
      check({ dimension: "geo", weight: 100, ratio: 1 }),
      check({ dimension: "tech", weight: 100, ratio: 1 }),
    ]);
    expect(r.overall).toBe(100);
    expect(r.grade).toBe("A");
    expect(r.capped).toBe(false);
  });

  it("excludes a not-applicable dimension from the overall and renormalizes", () => {
    const r = scoreAudit([
      check({ dimension: "seo", weight: 100, ratio: 0.8 }), // 80
      check({ dimension: "geo", weight: 100, ratio: 0.8 }), // 80
      check({ dimension: "tech", weight: 100, ratio: 0.8 }), // 80
      check({ dimension: "tracking", weight: 100, ratio: null }), // unverifiable -> N/A, excluded
    ]);
    expect(r.dimensions.find((d) => d.id === "tracking")!.notApplicable).toBe(true);
    // 80 across the three assessable dims; tracking neither drags (would be 60) nor inflates (would be 85).
    expect(r.overall).toBe(80);
    expect(r.grade).toBe("B");
  });

  it("drops the overall one grade below the math on a critical failure", () => {
    const r = scoreAudit([
      check({ dimension: "seo", weight: 100, ratio: 1 }),
      check({ dimension: "tracking", weight: 100, ratio: 1 }),
      check({ dimension: "geo", weight: 100, ratio: 1 }),
      check({ dimension: "tech", weight: 90, ratio: 1 }),
      check({ id: "TB1", dimension: "tech", weight: 10, ratio: 0, severity: "critical" }),
    ]);
    // tech rawScore 90 -> capped to 59; math = .3*100 + .25*100 + .25*100 + .2*59 = 91.8 (A) -> floored to <= 89 (B)
    expect(r.dimensions.find((d) => d.id === "tech")!.score).toBe(59);
    expect(r.capped).toBe(true);
    expect(r.overall).toBeLessThanOrEqual(89);
    expect(r.grade).not.toBe("A");
  });
});

describe("buildActionPlan", () => {
  it("ranks by priority, flags quick wins and approval, excludes passing checks", () => {
    const plan = buildActionPlan([
      check({ id: "A", ratio: 0, severity: "critical", dimension: "tracking", effort: 2 }),
      check({ id: "B", ratio: 0, severity: "low", dimension: "seo", effort: 1 }),
      check({ id: "C", ratio: 1 }), // passing -> excluded
      check({ id: "D", ratio: null }), // N/A -> excluded
    ]);
    expect(plan.map((p) => p.checkId)).toEqual(["A", "B"]); // priority 8 then 3
    expect(plan[0].quickWin).toBe(true);
    expect(plan[0].requiresApproval).toBe(true); // tracking change
    expect(plan[1].requiresApproval).toBe(false);
  });
});
