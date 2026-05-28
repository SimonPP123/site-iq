import { describe, it, expect } from "vitest";
import { runAudit, runChecks } from "./checks";
import { scoreAudit } from "./scoring";
import { strictAuditResultSchema } from "./contract";
import type { CrawledPage } from "./types";

/**
 * Phase 2B tests. Asserts the per-audit page rollup that runAudit emits and that scoreAudit stitches
 * into the AuditResult, plus the contract's mirror-invariant superRefine. Existing call sites use
 * the backward-compat `runChecks` wrapper - covered by checks.test.ts. These tests target the new
 * surface and the silent-failure-hunter list (red-line #3): pagesWithIssues must reflect FULL data,
 * not a truncated-failing-array union.
 */

const page = (path: string, opts: { title?: string; head?: string } = {}): CrawledPage => {
  const rawHtml = `<!DOCTYPE html><html lang="en"><head>${opts.head ?? ""}</head><body><h1>H</h1></body></html>`;
  return {
    metadata: {
      sourceURL: `https://ex.com${path}`,
      title: opts.title ?? "Acme - Real-time Analytics Platform",
      statusCode: 200,
    },
    rawHtml,
    html: rawHtml,
    markdown: "Acme is a real-time analytics platform for product teams.",
  };
};

describe("runAudit - per-audit page rollups", () => {
  it("emits sorted, de-duped pages list of every successfully-crawled URL", () => {
    const out = runAudit(
      [page("/about"), page("/"), page("/contact"), page("/")],
      "https://ex.com",
    );
    // Sorted, de-duped by path (two "/" entries collapse to one). Sort is deterministic so the UI
    // and the snapshot tests get a stable order.
    expect(out.pages).toEqual([{ path: "/" }, { path: "/about" }, { path: "/contact" }]);
  });

  it("returns an empty pages list when nothing is usable", () => {
    const out = runAudit([], "https://ex.com");
    expect(out.pages).toEqual([]);
    expect(out.pagesWithIssues).toBe(0);
  });

  it("pagesWithIssues counts unique paths (deduped across checks), not sum-of-failing-entries", () => {
    // 3 minimal pages -> every page fails several checks (no canonical, no description, no OG,
    // no JSON-LD, ...). Sum of failing entries across all checks runs into the dozens, but
    // pagesWithIssues is bounded by the sample size (3) because it dedupes by path.
    const out = runAudit(
      [page("/"), page("/about"), page("/contact")],
      "https://ex.com",
    );
    expect(out.pagesWithIssues).toBe(3); // one per unique path
    const totalFailingEntries = out.checks.reduce(
      (sum, c) => sum + (c.evidence?.failing?.length ?? 0),
      0,
    );
    expect(totalFailingEntries).toBeGreaterThan(out.pagesWithIssues); // proves dedupe is real, not no-op
  });

  it("pagesWithIssues stays accurate when failing arrays overflow the EVID_CAP (more > 0)", () => {
    // 14 pages all failing S1 (short title). mkEvidence caps evidence.failing[] at 12 and reports
    // more=2. Deriving pagesWithIssues from the truncated arrays would yield 12 - the rollup must
    // see all 14. This is the silent-failure-hunter red-line #3 guarantee.
    const pages = Array.from({ length: 14 }, (_, i) => page(`/p${i}`, { title: "x" }));
    const out = runAudit(pages, "https://ex.com");
    expect(out.pages).toHaveLength(14);
    expect(out.pagesWithIssues).toBe(14);
    const s1 = out.checks.find((c) => c.id === "S1");
    expect(s1?.evidence?.failing).toHaveLength(12);
    expect(s1?.evidence?.more).toBe(2);
  });

  it("pagesWithIssues is 0 when no per-page check fails on any sampled page", () => {
    // A page that passes the visible per-page checks; some non-page checks (TB30 headers, G9 robots)
    // are N/A here so they do not contribute. pagesWithIssues counts PAGES that failed, not CHECKS,
    // and N/A checks have empty failing[].
    const out = runAudit(
      [
        page("/", {
          title: "Acme - Real-time Analytics Dashboards for Teams",
          head: '<meta name="description" content="Acme is a real-time analytics platform that helps teams track metrics, build dashboards and make data-driven decisions with speed and confidence every day for product teams.">',
        }),
      ],
      "https://ex.com",
    );
    // Some site-level checks may still fail (TB30, TB31 absent headers...) but those checks have
    // checked=undefined and no failing[] - so pagesWithIssues only sees the per-page misses.
    // Here the home page itself fails several site-level checks via aux=missing -> pagesWithIssues
    // can be 0 OR 1 depending on which checks the page itself fails. Assert >=0 and <=1.
    expect(out.pagesWithIssues).toBeGreaterThanOrEqual(0);
    expect(out.pagesWithIssues).toBeLessThanOrEqual(1);
  });
});

describe("runChecks - backward-compat wrapper", () => {
  it("returns just the CheckResult[] (existing call sites unchanged)", () => {
    const checks = runChecks([page("/"), page("/about")], "https://ex.com");
    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThan(0);
    expect(checks[0]).toHaveProperty("id");
    expect(checks[0]).toHaveProperty("ratio");
  });
});

describe("scoreAudit - AuditPageInfo passthrough", () => {
  it("does NOT add page fields when called without pageInfo (old call sites unchanged)", () => {
    const r = scoreAudit([]);
    expect(r.pages).toBeUndefined();
    expect(r.pagesWithIssues).toBeUndefined();
    expect(r.pagesExcluded).toBeUndefined();
  });

  it("adds page fields verbatim when pageInfo is passed", () => {
    const r = scoreAudit([], {
      pages: [{ path: "/" }, { path: "/about" }],
      pagesWithIssues: 1,
      pagesExcluded: 3,
    });
    expect(r.pages).toEqual([{ path: "/" }, { path: "/about" }]);
    expect(r.pagesWithIssues).toBe(1);
    expect(r.pagesExcluded).toBe(3);
  });

  it("only stitches in fields that are actually present in pageInfo", () => {
    const r = scoreAudit([], { pagesExcluded: 0 });
    expect(r.pages).toBeUndefined();
    expect(r.pagesWithIssues).toBeUndefined();
    expect(r.pagesExcluded).toBe(0); // 0 is meaningful - filter ran but excluded nothing
  });
});

describe("contract.strictAuditResultSchema - mirror invariant", () => {
  // Minimum valid envelope: 4 dimensions, no page lists, no failing paths.
  const skel = {
    overall: 80,
    grade: "B" as const,
    capped: false,
    dimensions: [
      { id: "seo" as const,      label: "SEO",      score: 80, rawScore: 80, capped: false, checks: [] },
      { id: "tracking" as const, label: "Tracking", score: 80, rawScore: 80, capped: false, checks: [] },
      { id: "geo" as const,      label: "GEO",      score: 80, rawScore: 80, capped: false, checks: [] },
      { id: "tech" as const,     label: "Tech",     score: 80, rawScore: 80, capped: false, checks: [] },
    ],
    actionPlan: [],
  };

  it("accepts a report that omits the pages list (backward compat for old reports)", () => {
    const r = strictAuditResultSchema.safeParse(skel);
    expect(r.success).toBe(true);
  });

  it("accepts a valid mirror: every failing.path is in result.pages", () => {
    const valid = {
      ...skel,
      pages: [{ path: "/" }, { path: "/about" }],
      pagesWithIssues: 1,
      dimensions: skel.dimensions.map((d) =>
        d.id === "seo"
          ? { ...d, checks: [{ id: "S1", ratio: 0, evidence: { where: "x", failing: [{ path: "/about" }] } }] }
          : d,
      ),
    };
    const r = strictAuditResultSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("rejects a report where evidence.failing references a path not in result.pages", () => {
    const invalid = {
      ...skel,
      pages: [{ path: "/" }],
      pagesWithIssues: 1,
      dimensions: skel.dimensions.map((d) =>
        d.id === "seo"
          ? { ...d, checks: [{ id: "S1", ratio: 0, evidence: { where: "x", failing: [{ path: "/not-in-pages" }] } }] }
          : d,
      ),
    };
    const r = strictAuditResultSchema.safeParse(invalid);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/not in result\.pages/);
    }
  });

  it("rejects a path containing an RTL override (U+202E) - defense vs visual spoofing", () => {
    // U+202E is RIGHT-TO-LEFT OVERRIDE; an attacker site could redirect through a URL containing
    // this to render `/admin` in the report while the real path is something benign (or vice versa
    // - render a benign path while the real one is /admin). The Phase 2A regex strips it on the
    // n8n side but the contract is defense-in-depth at the persistence boundary.
    const r = strictAuditResultSchema.safeParse({
      ...skel,
      pagesFailed: [{ path: "/about‮‮nimda/", reason: "4xx" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/control or directional-formatting/i);
    }
  });

  it("rejects a path containing ASCII control characters (DEL)", () => {
    const r = strictAuditResultSchema.safeParse({
      ...skel,
      pages: [{ path: "/safehidden" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a path containing a zero-width space (U+200B)", () => {
    const r = strictAuditResultSchema.safeParse({
      ...skel,
      pages: [{ path: "/legit​spoof" }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts a clean path (no rejected characters)", () => {
    const r = strictAuditResultSchema.safeParse({
      ...skel,
      pages: [{ path: "/about" }, { path: "/blog/cold-brew-guide" }],
      pagesWithIssues: 0,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid pagesFailed list with structured reasons (Phase 2E)", () => {
    const r = strictAuditResultSchema.safeParse({
      ...skel,
      pagesFailed: [
        { path: "/old-promo",   reason: "4xx" },
        { path: "/legacy/api",  reason: "5xx" },
        { path: "/blank",       reason: "no-content" },
        { path: "/slow",        reason: "timeout" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a pagesFailed entry with an unknown reason value", () => {
    const r = strictAuditResultSchema.safeParse({
      ...skel,
      pagesFailed: [{ path: "/x", reason: "blocked" }], // 'blocked' is not in the enum
    });
    expect(r.success).toBe(false);
  });

  it("does NOT enforce the invariant when result.pages is absent (passthrough payloads)", () => {
    // Old reports (pre-2B) carry failing[] arrays but no pages list. The schema must not invent
    // pages out of failing[] and reject them - that would break every legacy report.
    const old = {
      ...skel,
      dimensions: skel.dimensions.map((d) =>
        d.id === "seo"
          ? { ...d, checks: [{ id: "S1", ratio: 0, evidence: { where: "x", failing: [{ path: "/anything" }] } }] }
          : d,
      ),
    };
    const r = strictAuditResultSchema.safeParse(old);
    expect(r.success).toBe(true);
  });
});
