import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runChecks } from "./checks";
import { scoreAudit, DIMENSION_WEIGHTS } from "./scoring";
import type { CheckResult } from "./types";

/**
 * Drift guard for the hand-maintained 1:1 port of checks.ts / scoring.ts into the n8n "Run checks"
 * and "Score" Code nodes. We read the emitted workflow JSON and assert it still carries every check
 * id (with dimension + weight + SEVERITY + critical flag), the dimension weights, the critical-failure
 * floor, and the detection fixes - that the emitted JS is syntactically valid, AND that the ported
 * SCORE_JS produces byte-identical scores to scoring.ts on a fixed fixture (a real logic check, not
 * just string presence). If the TypeScript and the n8n port diverge, this test fails, which is the
 * answer to "what stops these two copies drifting apart?".
 */
const here = dirname(fileURLToPath(import.meta.url));
const workflow = JSON.parse(
  readFileSync(resolve(here, "../../../n8n-workflows/site-iq-audit.json"), "utf-8"),
) as { nodes: { name: string; parameters?: { jsCode?: string } }[] };

const codeOf = (name: string): string => {
  const node = workflow.nodes.find((n) => n.name === name);
  if (!node?.parameters?.jsCode) throw new Error(`workflow node "${name}" not found or has no jsCode`);
  return node.parameters.jsCode;
};

describe("n8n <-> TypeScript parity (site-iq-audit.json)", () => {
  const runChecksCode = codeOf("Run checks");
  const scoreCode = codeOf("Score");
  const checks = runChecks([], "");

  it("emits the same number of checks as checks.ts", () => {
    const portCount = (runChecksCode.match(/C\('/g) ?? []).length;
    expect(portCount).toBe(checks.length); // 58
  });

  it("carries every check id with its dimension and weight", () => {
    for (const c of checks) {
      const re = new RegExp(`C\\('${c.id}',[^\\n]*'${c.dimension}',\\s*${c.weight},`);
      expect(
        re.test(runChecksCode),
        `${c.id} (${c.dimension}, weight ${c.weight}) is missing or changed in the n8n port`,
      ).toBe(true);
    }
  });

  it("carries every check's SEVERITY associated with its id (catches severity drift)", () => {
    // The port emits each check as C('<id>', '<label>', '<dimension>', <weight>, '<severity>', ...).
    // Pin the severity to the id so a silent severity change in one copy but not the other fails here
    // (severity drives both the critical-failure floor and the action-plan impact ranking).
    for (const c of checks) {
      const re = new RegExp(
        `C\\('${c.id}',[^\\n]*'${c.dimension}',\\s*${c.weight},\\s*'${c.severity}',`,
      );
      expect(
        re.test(runChecksCode),
        `${c.id} severity "${c.severity}" is missing or changed in the n8n port`,
      ).toBe(true);
    }
  });

  it("agrees on which checks are critical (catches critical-flag drift)", () => {
    // Neither copy sets an explicit `critical` flag - both derive it from `severity === 'critical'`
    // (checks.ts via isCritical(); the port via isCrit()). So the set of critical ids must be exactly
    // the severity:'critical' ids, and each such id must carry 'critical' as its severity token in the
    // port. This guards the floor: a check wrongly (de)graded to/from critical would change capping.
    const criticalIds = checks.filter((c) => (c.critical ?? c.severity === "critical")).map((c) => c.id);
    expect(criticalIds.sort()).toEqual(
      checks.filter((c) => c.severity === "critical").map((c) => c.id).sort(),
    );
    for (const id of criticalIds) {
      const re = new RegExp(`C\\('${id}',[^\\n]*,\\s*'critical',`);
      expect(re.test(runChecksCode), `${id} should be 'critical' in the n8n port`).toBe(true);
    }
    // And the port derives critical from severity, not an explicit flag (same as checks.ts).
    expect(scoreCode).toContain("c.severity === 'critical'");
  });

  it("carries the dimension weights and the critical-failure floor (59)", () => {
    expect(scoreCode).toContain(String(DIMENSION_WEIGHTS.seo)); // 0.3
    expect(scoreCode).toContain(String(DIMENSION_WEIGHTS.tracking)); // 0.25
    expect(scoreCode).toContain(String(DIMENSION_WEIGHTS.tech)); // 0.2
    expect(scoreCode).toContain("59");
  });

  it("mirrors the GA4 (config-form) and mixed-content (sub-resource) detection fixes", () => {
    expect(runChecksCode).toContain("['\"]config['\"]");
    expect(runChecksCode).toContain("<link[^>]+href=");
  });

  it("emits syntactically valid JavaScript for the Code nodes", () => {
    // new Function compiles (parses) without executing - n8n globals like $input are fine here.
    expect(() => new Function(runChecksCode)).not.toThrow();
    expect(() => new Function(scoreCode)).not.toThrow();
  });

  // --- GOLDEN SCORING: run the SAME fixture through scoring.ts (TS) AND the ported SCORE_JS, then
  // assert identical overall / grade / per-dimension scores. This is the real logic guard: it catches
  // a scoring divergence (weights, renormalization, the critical floor, rounding) that string checks
  // miss. The Score node only references $input.first().json and returns an n8n item array, so it
  // evaluates cleanly under a tiny $input shim - no n8n runtime needed.
  describe("golden scoring fixture: SCORE_JS matches scoring.ts numerically", () => {
    // A fixed, hand-built CheckResult[] spanning all 4 dimensions, including:
    //  - a CRITICAL fail (TB1 ratio 0) -> exercises the dimension cap (<=59) + the overall one-grade
    //    floor, the most logic-heavy path;
    //  - a NULL / N/A check (T1 ratio null) -> exercises N/A renormalization within a dimension;
    //  - partial ratios -> exercises the weighted average + round1.
    const fixture: CheckResult[] = [
      // SEO: one strong, one partial
      { id: "S1", label: "Title", dimension: "seo", weight: 10, severity: "high", ratio: 1, effort: 1 },
      { id: "S2", label: "Meta desc", dimension: "seo", weight: 7, severity: "medium", ratio: 0.5, effort: 1 },
      // Tracking: one detected, one N/A (must be renormalized out, not scored as 0)
      { id: "T1", label: "Analytics", dimension: "tracking", weight: 16, severity: "high", ratio: null, effort: 3 },
      { id: "T5", label: "Consent Mode", dimension: "tracking", weight: 16, severity: "high", ratio: 1, effort: 3 },
      // GEO: a partial
      { id: "G1", label: "JSON-LD", dimension: "geo", weight: 8, severity: "high", ratio: 0.75, effort: 2 },
      // Tech: a passing high + a CRITICAL FAIL (caps tech at 59 and floors the overall one grade)
      { id: "TB4", label: "Viewport", dimension: "tech", weight: 14, severity: "critical", ratio: 1, effort: 1 },
      { id: "TB1", label: "HTTPS", dimension: "tech", weight: 16, severity: "critical", ratio: 0, effort: 2 },
    ];

    // Evaluate the ported SCORE_JS with a minimal $input shim. SCORE_JS does
    // `const input = $input.first().json; ... return [{ json: { ..., result } }];`
    const runScoreJs = (checks: CheckResult[]) => {
      const $input = { first: () => ({ json: { reportId: "r", domain: "d", pagesSampled: 1, pagesAttempted: 1, checks } }) };
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function("$input", scoreCode) as (i: typeof $input) => Array<{ json: { result: { overall: number; grade: string; dimensions: { id: string; score: number }[] } } }>;
      return fn($input)[0].json.result;
    };

    it("produces the same overall, grade, and per-dimension scores", () => {
      const ts = scoreAudit(fixture);
      const js = runScoreJs(fixture);

      expect(js.overall).toBe(ts.overall);
      expect(js.grade).toBe(ts.grade);

      // Per-dimension score parity (id -> score).
      const tsByDim = Object.fromEntries(ts.dimensions.map((d) => [d.id, d.score]));
      const jsByDim = Object.fromEntries(js.dimensions.map((d) => [d.id, d.score]));
      expect(jsByDim).toEqual(tsByDim);

      // Sanity: the fixture actually exercises the interesting paths (so a future edit that neutralizes
      // it - e.g. removing the critical fail - is visible). TB1 critical fail -> capped + tech <= 59.
      expect(ts.capped).toBe(true);
      expect(tsByDim.tech).toBeLessThanOrEqual(59);
    });
  });
});
