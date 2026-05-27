import { describe, it, expect } from "vitest";
import { runChecks } from "./checks";
import { DIMENSIONS, TOTAL_CHECKS } from "./rubric";

/**
 * The /methodology "what we check" page renders from DIMENSIONS/TOTAL_CHECKS in rubric.ts, which are
 * derived from the engine. This guard asserts they stay faithful to runChecks - so the public,
 * "radical transparency" rubric can never silently drift from how the score is actually computed
 * (the bug where the page showed a stale per-check weight).
 */
describe("methodology rubric mirrors the audit engine", () => {
  const engine = runChecks([], "");
  const byId = new Map(engine.map((c) => [c.id, c]));
  const rubricChecks = DIMENSIONS.flatMap((d) => d.checks);

  it("covers exactly the engine's checks (count + ids)", () => {
    expect(TOTAL_CHECKS).toBe(engine.length);
    expect(rubricChecks.length).toBe(engine.length);
    expect(new Set(rubricChecks.map((c) => c.id))).toEqual(new Set(engine.map((c) => c.id)));
  });

  it("carries the engine's weight, severity, and dimension for every check", () => {
    for (const d of DIMENSIONS) {
      for (const c of d.checks) {
        const truth = byId.get(c.id);
        expect(truth, `${c.id} is not produced by the engine`).toBeDefined();
        expect(c.weight, `${c.id} weight drifted from the engine`).toBe(truth!.weight);
        expect(c.severity, `${c.id} severity drifted from the engine`).toBe(truth!.severity);
        expect(d.key, `${c.id} is under the wrong dimension`).toBe(truth!.dimension);
      }
    }
  });

  it("dimension percentage weights sum to 100", () => {
    expect(DIMENSIONS.reduce((sum, d) => sum + d.weight, 0)).toBe(100);
  });
});
