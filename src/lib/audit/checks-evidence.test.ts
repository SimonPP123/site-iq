import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runChecks } from "./checks";
import type { CheckResult, CrawledPage } from "./types";

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
  it("lists the exact pages that fail a per-page check (S1 short titles)", () => {
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
    expect(e?.failing).toEqual(["/about", "/contact"]);
  });

  it("uses the root path '/' for the home page", () => {
    const checks = runChecks([page("/", { title: "Hi" })], "https://ex.com");
    expect(ev(checks, "S1")?.failing).toEqual(["/"]);
    expect(ev(checks, "S1")?.where).toBe("Across all 1 crawled page"); // singular
  });

  it("caps the failing list at 12 and reports the overflow in `more`", () => {
    const pages = Array.from({ length: 14 }, (_, i) => page(`/p${i}`, { title: "x" }));
    const e = ev(runChecks(pages, "https://ex.com"), "S1");
    expect(e?.failing?.length).toBe(12);
    expect(e?.more).toBe(2);
  });

  it("de-dupes failing paths that normalize to the same path (/about and /about/)", () => {
    const checks = runChecks(
      [page("/about", { title: "Us" }), page("/about/", { title: "Hi" })],
      "https://ex.com",
    );
    // Both pages fail S1 and both normalize to "/about" - the displayed list must not repeat it.
    expect(ev(checks, "S1")?.failing).toEqual(["/about"]);
    expect(ev(checks, "S1")?.where).toBe("Across all 2 crawled pages");
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
  // like an undefined AuditAux field on the TS side.
  const runPort = (pages: CrawledPage[], headers?: Record<string, string>): CheckResult[] => {
    const present = (json: unknown, all?: unknown[]) => ({ first: () => ({ json }), all: () => all ?? [] });
    const absent = { first: () => undefined, all: () => [] as unknown[] };
    const urls = pages.map((p) => p.metadata?.sourceURL).filter(Boolean);
    const $ = (name: string) => {
      switch (name) {
        case "Normalize":
          return present({ reportId: "r", domain: "ex.com", rootUrl: "https://ex.com" });
        case "Scraped pages":
          return present(undefined, pages.map((p) => ({ json: p })));
        case "Pick URLs":
          return present({ urls });
        case "Fetch headers":
          return headers ? present({ headers, body: "" }) : absent;
        default:
          return absent; // robots, sitemap, llms, GTM, Verify semantic -> not fetched
      }
    };
    const fn = new Function("$", runChecksCode) as (
      d: typeof $,
    ) => Array<{ json: { checks: CheckResult[] } }>;
    return fn($)[0].json.checks;
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
    const port = runPort(pages, headers);

    expect(port.length).toBe(ts.length);
    const project = (c: CheckResult) => [c.id, { ratio: c.ratio, evidence: c.evidence }] as const;
    expect(Object.fromEntries(port.map(project))).toEqual(Object.fromEntries(ts.map(project)));
  });
});
