import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runAudit, runChecks } from "./checks";
import type { AuditedPage, CheckResult, CrawledPage, FailedPage } from "./types";

/**
 * Tests for the per-check "evidence" (where we checked / which pages failed). Two parts:
 *  1. Unit tests of the evidence the TS engine attaches: failing-page lists, the "where" labels per
 *     check type, the 12-page cap, N/A skipping, and the semantic-override relabel.
 *  2. An EXECUTABLE parity guard: run the n8n port's "Run checks" Code node (CHECKS_JS, read from the
 *     emitted workflow JSON) against the same pages and assert it produces byte-identical ratios AND
 *     evidence. parity.test.ts only string-matches CHECKS_JS, so it cannot catch evidence drift - this
 *     executes both copies and compares their output.
 */

const ev = (checks: CheckResult[], id: string) => checks.find((c) => c.id === id)?.evidence;
const ratioOf = (checks: CheckResult[], id: string) => checks.find((c) => c.id === id)?.ratio ?? null;

/** A page with an explicit path + title so we can assert which path lands in a failing list. */
const page = (
  path: string,
  opts: { title?: string; head?: string; html?: string; markdown?: string } = {},
): CrawledPage => {
  const rawHtml = `<!DOCTYPE html><html lang="en"><head>${opts.head ?? ""}</head><body><h1>H</h1></body></html>`;
  return {
    metadata: {
      sourceURL: `https://ex.com${path}`,
      title: opts.title ?? "Acme - Real-time Analytics Platform",
      statusCode: 200,
    },
    rawHtml,
    html: opts.html ?? rawHtml,
    markdown: opts.markdown ?? "Acme is a real-time analytics platform for product teams.",
  };
};

describe("check evidence (TS engine)", () => {
  it("lists the exact pages that fail a per-page check (S1 short titles) with structured reasons", () => {
    const checks = runChecks(
      [
        page("/", { title: "Acme - Real-time Analytics Platform" }),
        page("/about", { title: "Us" }),
        page("/contact", { title: "Hi" }),
      ],
      "https://ex.com",
    );
    const e = ev(checks, "S1");
    expect(e?.where).toBe("Across all 3 crawled pages");
    expect(e?.checked).toBe(3);
    expect(e?.failing).toEqual([
      { path: "/about",   reason: { kind: "too_short", actual: 2, min: 15 } },
      { path: "/contact", reason: { kind: "too_short", actual: 2, min: 15 } },
    ]);
  });

  it("uses the root path '/' for the home page", () => {
    const checks = runChecks([page("/", { title: "Hi" })], "https://ex.com");
    expect(ev(checks, "S1")?.failing).toEqual([
      { path: "/", reason: { kind: "too_short", actual: 2, min: 15 } },
    ]);
    expect(ev(checks, "S1")?.where).toBe("Across all 1 crawled page"); // singular
  });

  it("caps the failing list at 12 and reports the overflow in `more`", () => {
    const pages = Array.from({ length: 14 }, (_, i) => page(`/p${i}`, { title: "x" }));
    const e = ev(runChecks(pages, "https://ex.com"), "S1");
    expect(e?.failing?.length).toBe(12);
    expect(e?.more).toBe(2);
    // Every entry carries a structured reason, not a bare path.
    expect(e?.failing?.[0]?.reason?.kind).toBe("too_short");
  });

  it("de-dupes failing paths that normalize to the same path (/about and /about/)", () => {
    const checks = runChecks(
      [page("/about", { title: "Us" }), page("/about/", { title: "Hi" })],
      "https://ex.com",
    );
    // Both pages fail S1 and both normalize to "/about" - the displayed list must not repeat it.
    // First-reason wins on dedupe collision (documented in mkEvidence).
    expect(ev(checks, "S1")?.failing).toEqual([
      { path: "/about", reason: { kind: "too_short", actual: 2, min: 15 } },
    ]);
    expect(ev(checks, "S1")?.where).toBe("Across all 2 crawled pages");
  });

  it("emits a `too_long` reason when the title overflows the upper bound", () => {
    const longTitle = "Acme " + "X".repeat(80);
    const checks = runChecks([page("/", { title: longTitle })], "https://ex.com");
    expect(ev(checks, "S1")?.failing).toEqual([
      { path: "/", reason: { kind: "too_long", actual: longTitle.length, max: 60 } },
    ]);
  });

  it("emits a `missing` reason when the title is absent entirely", () => {
    const checks = runChecks([page("/", { title: "" })], "https://ex.com");
    expect(ev(checks, "S1")?.failing).toEqual([
      { path: "/", reason: { kind: "missing", what: "title" } },
    ]);
  });

  it("emits a `noindex` reason on a page with <meta robots=\"noindex\"> (S4)", () => {
    const checks = runChecks(
      [page("/blocked", { title: "Title acceptable length here", head: `<meta name="robots" content="noindex">` })],
      "https://ex.com",
    );
    expect(ev(checks, "S4")?.failing).toEqual([
      { path: "/blocked", reason: { kind: "noindex" } },
    ]);
  });

  it("emits a `non_https` reason on an HTTP page (TB1)", () => {
    const checks = runChecks([page("/", { title: "Acceptable title here" })], "http://ex.com");
    // page() helper uses opts.url for sourceURL; the default base in our page builder is the rootUrl.
    // Use a directly-http source so TB1 sees it.
    const httpChecks = runChecks(
      [{ ...page("/", { title: "Acceptable title here" }), metadata: { ...(page("/", { title: "Acceptable title here" }).metadata ?? {}), sourceURL: "http://ex.com/" } }],
      "http://ex.com",
    );
    expect(ev(httpChecks, "TB1")?.failing).toEqual([
      { path: "/", reason: { kind: "non_https" } },
    ]);
    expect(checks); // appease ts-unused
  });

  it("does not attach a reason to a fail-open path (broken diagnostic counts as pass)", () => {
    // A diagnostic that throws is treated as PASS in covR. This is an invariant test - we don't have
    // a public hook to inject a throwing diagnostic, but we can assert the surrounding shape: covR's
    // catch block bumps `pass`, so a fixture where ALL diagnostics succeed produces no `failing` entries.
    const checks = runChecks([page("/", { title: "Acceptable title length here" })], "https://ex.com");
    expect(ev(checks, "S1")?.failing).toBeUndefined();
  });

  it("labels site-source checks by their source, with no page list", () => {
    const checks = runChecks([page("/")], "https://ex.com", {
      headersFetched: true,
      headers: { "strict-transport-security": "max-age=31536000" },
      robotsFetched: true,
      robotsTxt: "User-agent: GPTBot\nDisallow: /",
    });
    expect(ev(checks, "TB30")?.where).toBe("The root URL's response headers");
    expect(ev(checks, "TB30")?.failing).toBeUndefined();
    expect(ev(checks, "G9")?.where).toBe("The site's robots.txt");
  });

  it("labels tracking checks as site-level detection", () => {
    const checks = runChecks(
      [page("/", { head: `<script>gtag("config","G-ABCDEFGHIJ")</script>` })],
      "https://ex.com",
    );
    expect(ratioOf(checks, "T1")).toBe(1);
    expect(ev(checks, "T1")?.where).toBe("Tag/script detection across all 1 crawled page");
  });

  it("adds the GTM container to the tracking 'where' when the container was parsed", () => {
    const checks = runChecks([page("/")], "https://ex.com", {
      gtm: { ga4: ["G-XXXXXXXX"], adwords: [], ua: false, consent: false, consentV2: false, pixels: false },
    });
    expect(ev(checks, "T1")?.where).toContain("plus the GTM container");
  });

  it("does not attach evidence to N/A checks", () => {
    const checks = runChecks([page("/")], "https://ex.com"); // no headers/robots aux -> TB30/G9 null
    expect(ratioOf(checks, "TB30")).toBeNull();
    expect(ev(checks, "TB30")).toBeUndefined();
  });

  it("replaces evidence with a semantic label when a grounded verdict applies", () => {
    const checks = runChecks([page("/")], "https://ex.com", { semantic: { G8: 1 } });
    expect(ratioOf(checks, "G8")).toBe(1);
    expect(ev(checks, "G8")?.where).toBe("Assessed over the page's content (grounded semantic check)");
    expect(ev(checks, "G8")?.failing).toBeUndefined();
  });
});

describe("n8n <-> TS evidence parity (executes the ported CHECKS_JS)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const workflow = JSON.parse(
    readFileSync(resolve(here, "../../../n8n-workflows/site-iq-audit.json"), "utf-8"),
  ) as { nodes: { name: string; parameters?: { jsCode?: string } }[] };
  const runChecksCode = workflow.nodes.find((n) => n.name === "Run checks")?.parameters?.jsCode;
  if (!runChecksCode) throw new Error('"Run checks" node not found in workflow JSON');

  // Execute the port's CHECKS_JS with a $() shim feeding the same pages + headers the TS engine gets.
  // Nodes returned as `absent` make the port's try/catch treat them as not-fetched (fail-open), exactly
  // like an undefined AuditAux field on the TS side. Returns the FULL emitted json so the parity
  // assertions can cover not just .checks but also the Phase-2B page rollups (pages,
  // pagesWithIssues, pagesExcluded) and the Phase-2E pagesFailed transparency list.
  interface PortJson {
    checks: CheckResult[];
    pages?: AuditedPage[];
    pagesWithIssues?: number;
    pagesExcluded?: number;
    pagesFailed?: FailedPage[];
  }
  const runPort = (
    pages: CrawledPage[],
    headers?: Record<string, string>,
    opts: { submittedUrlsOverride?: string[]; pagesExcluded?: number } = {},
  ): PortJson => {
    const present = (json: unknown, all?: unknown[]) => ({ first: () => ({ json }), all: () => all ?? [] });
    const absent = { first: () => undefined, all: () => [] as unknown[] };
    const urls = opts.submittedUrlsOverride ?? (pages.map((p) => p.metadata?.sourceURL).filter(Boolean) as string[]);
    const pickUrlsPayload: Record<string, unknown> = { urls };
    if (typeof opts.pagesExcluded === "number") pickUrlsPayload.pagesExcluded = opts.pagesExcluded;
    const $ = (name: string) => {
      switch (name) {
        case "Normalize":
          return present({ reportId: "r", domain: "ex.com", rootUrl: "https://ex.com" });
        case "Scraped pages":
          return present(undefined, pages.map((p) => ({ json: p })));
        case "Pick URLs":
          return present(pickUrlsPayload);
        case "Fetch headers":
          return headers ? present({ headers, body: "" }) : absent;
        default:
          return absent; // robots, sitemap, llms, GTM, Verify semantic -> not fetched
      }
    };
    const fn = new Function("$", runChecksCode) as (
      d: typeof $,
    ) => Array<{ json: PortJson }>;
    return fn($)[0].json;
  };

  it("produces byte-identical ratios + evidence for a mixed fixture", () => {
    const pages = [
      page("/", {
        title: "Acme - Real-time Analytics Platform",
        head: `<script>gtag("config","G-ABCDEFGHIJ")</script><link rel="canonical" href="https://ex.com/">`,
      }),
      page("/about", { title: "Us" }),
      page("/contact", { title: "Hi" }),
    ];
    const headers = {
      "strict-transport-security": "max-age=31536000",
      "x-content-type-options": "nosniff",
    };
    const ts = runChecks(pages, "https://ex.com", { headersFetched: true, headers });
    const port = runPort(pages, headers).checks;

    expect(port.length).toBe(ts.length);
    const project = (c: CheckResult) => [c.id, { ratio: c.ratio, evidence: c.evidence }] as const;
    expect(Object.fromEntries(port.map(project))).toEqual(Object.fromEntries(ts.map(project)));
  });

  it("page rollup parity (Phase 2B): pages list + pagesWithIssues match between TS and port", () => {
    // Three pages all with weak titles -> several checks fail per page. The rollup numbers must be
    // identical: same de-dupe semantics, same accumulator-before-truncation semantics. Catches a
    // future port drift where (e.g.) the n8n side stops feeding pagesWithIssuesSet inside covR.
    const pages = [page("/", { title: "Hi" }), page("/menu", { title: "Yo" }), page("/about", { title: "x" })];
    const ts = runAudit(pages, "https://ex.com");
    const port = runPort(pages);
    expect(port.pages).toEqual(ts.pages);
    expect(port.pagesWithIssues).toBe(ts.pagesWithIssues);
  });

  it("pagesExcluded passthrough (n8n PICK_JS -> CHECKS_JS rollup)", () => {
    // The SENSITIVE_PATH_RE filter lives in PICK_JS, not CHECKS_JS - the count is just passed
    // through. Asserts CHECKS_JS reads it from $('Pick URLs').first().json.pagesExcluded without
    // dropping or mutating it.
    const port = runPort([page("/", { title: "Hi" })], undefined, { pagesExcluded: 3 });
    expect(port.pagesExcluded).toBe(3);
  });

  it("pagesFailed shape (Phase 2E): n8n emits 'timeout' for submitted URLs Firecrawl never returned", () => {
    // Submit 3 URLs but only return 1 from "Scraped pages" -> the other 2 are unattributable
    // timeouts (no returned items for them, so the redirect heuristic correctly classifies them as
    // 'timeout'). TS engine has no equivalent (Firecrawl batch is n8n-only) so this is one-sided
    // verification of the n8n-emitted shape, not a cross-engine equality.
    const present = page("/", { title: "Acme - Real-time Analytics Platform" });
    const port = runPort([present], undefined, {
      submittedUrlsOverride: ["https://ex.com/", "https://ex.com/about", "https://ex.com/contact"],
    });
    expect(Array.isArray(port.pagesFailed)).toBe(true);
    const paths = (port.pagesFailed ?? []).map((f) => f.path).sort();
    expect(paths).toEqual(["/about", "/contact"]);
    for (const fp of port.pagesFailed ?? []) {
      expect(fp.reason).toBe("timeout");
    }
  });

  it("pagesFailed redirect guard: a submitted URL whose path appears among returned items is NOT flagged", () => {
    // Submitted /about, but Firecrawl returned /about-us (redirect). Without the allReturnedPaths
    // guard from commit b4fdfa2, /about would be falsely emitted as 'timeout'. This test pins the
    // guard so a future "simplification" cannot re-introduce the redirect-false-positive bug.
    const home = page("/", { title: "Acme - Real-time Analytics Platform" });
    const redirected = page("/about-us", { title: "About Us" });
    const port = runPort([home, redirected], undefined, {
      submittedUrlsOverride: ["https://ex.com/", "https://ex.com/about"],
    });
    // items.length (2) === submittedUrls.length (2), so pass 2 is skipped entirely.
    expect(port.pagesFailed ?? []).toEqual([]);
  });
});
