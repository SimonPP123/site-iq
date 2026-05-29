import { describe, it, expect } from "vitest";
import { runChecks } from "./checks";
import type { CheckResult, CrawledPage } from "./types";

/**
 * Regression tests for the Tier-2 accuracy fixes (see docs/CHECK-METHODOLOGY.md). These lock the
 * broadened detection so a future edit cannot silently revert it. The n8n port is the same logic,
 * guarded separately by parity.test.ts.
 */
const r = (checks: CheckResult[], id: string) => checks.find((c) => c.id === id)?.ratio ?? null;
const page = (head: string): CrawledPage => {
  const rawHtml = `<!DOCTYPE html><html lang="en"><head>${head}</head><body><p>Body.</p></body></html>`;
  return { metadata: { sourceURL: "https://x.example/", title: "X" }, rawHtml, html: rawHtml, markdown: "Body." };
};
const run = (head: string) => runChecks([page(head)], "https://x.example");

describe("Tier-2 accuracy improvements", () => {
  it("S4 catches reversed attribute order (content before name)", () => {
    expect(r(run(`<meta content="noindex,nofollow" name="robots">`), "S4")).toBe(0);
  });
  it("S4 catches a googlebot-specific noindex", () => {
    expect(r(run(`<meta name="googlebot" content="noindex">`), "S4")).toBe(0);
  });
  it("S4 still passes a normal indexable page", () => {
    expect(r(run(`<meta name="robots" content="index,follow">`), "S4")).toBe(1);
  });

  it("S21 accepts a script subtag (zh-Hant) and a 3-letter code (fil)", () => {
    expect(
      r(run(`<link rel="alternate" hreflang="zh-Hant" href="/zh"><link rel="alternate" hreflang="fil" href="/fil">`), "S21"),
    ).toBe(1);
  });

  it("S12 accepts og:image alone (not just og:title)", () => {
    expect(r(run(`<meta property="og:image" content="/x.png">`), "S12")).toBe(1);
  });

  it("T8 detects a Snapchat pixel (snaptr)", () => {
    expect(r(run(`<script>snaptr('init','x');</script>`), "T8")).toBe(1);
  });
  it("T7 detects a TCF CMP via __tcfapi", () => {
    expect(r(run(`<script>window.__tcfapi=function(){};</script>`), "T7")).toBe(1);
  });
  it("T7 detects the CookieYes 'Cookie Law Info' WordPress plugin (cookie-law-info)", () => {
    // The common WordPress CMP plugin ships its banner from /wp-content/plugins/cookie-law-info/...
    // The SaaS brand "cookieyes" was already recognised, but the self-hosted plugin slug was not, so
    // WordPress sites using it (e.g. z-consult.bg) fell to N/A when GTM was also present. Lock the fix.
    expect(
      r(run(`<script src="/wp-content/plugins/cookie-law-info/lite/frontend/js/script.min.js"></script>`), "T7"),
    ).toBe(1);
  });
  it("T7 detects the WordPress 'Cookie Notice' plugin (phase 1 CMP breadth)", () => {
    expect(r(run(`<link rel="stylesheet" href="/wp-content/plugins/cookie-notice/css/front.min.css">`), "T7")).toBe(1);
  });
  it("T1 detects a non-Google analytics platform (Cloudflare Web Analytics)", () => {
    expect(r(run(`<script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script>`), "T1")).toBe(1);
  });
  it("TB19 credits an image CDN that auto-negotiates modern formats (Cloudinary .jpg url)", () => {
    // 1 image via Cloudinary, no lazy attr: modern coverage 1/1, lazy 0/1 -> (1 + 0) / 2 = 0.5.
    // Before the CDN-signature fix this scored 0 (no literal .webp/.avif/<picture>).
    expect(r(run(`<img src="https://res.cloudinary.com/demo/image/upload/v1/sample.jpg">`), "TB19")).toBe(0.5);
  });
  it("G5 detects a <details>/<summary> FAQ accordion", () => {
    expect(r(run(`<details><summary>What is GDPR?</summary><p>A regulation.</p></details>`), "G5")).toBe(1);
  });
  it("G20 detects a French 'Points cles' takeaways block", () => {
    const fr: CrawledPage = {
      metadata: { sourceURL: "https://x.example/", title: "X" },
      rawHtml: "<html></html>",
      html: "<html></html>",
      markdown: "# Points cles\n\n- premier point\n- deuxieme point\n\nLe reste du contenu.",
    };
    expect(r(runChecks([fr], "https://x.example"), "G20")).toBe(1);
  });
  it("G20 detects a Bulgarian 'Резюме' takeaways block (Cyrillic)", () => {
    const bg: CrawledPage = {
      metadata: { sourceURL: "https://x.example/", title: "X" },
      rawHtml: "<html></html>",
      html: "<html></html>",
      markdown: "## Резюме\n\n- първа точка\n- втора точка\n\nОстаналото съдържание тук.",
    };
    expect(r(runChecks([bg], "https://x.example"), "G20")).toBe(1);
  });
  it("G19 catches a Bulgarian filler opener ('Това ...') so the section is not a direct answer", () => {
    // EN-only filler list would let a "Това" (This...) opener pass as a good answer; the Cyrillic
    // addition catches it, so this single-section page scores 0. Opener is 31 words (in 30-130 window).
    const bg: CrawledPage = {
      metadata: { sourceURL: "https://x.example/", title: "X" },
      rawHtml: "<html></html>",
      html: "<html></html>",
      markdown:
        "## Услуги\n\nТова е изречение което съдържа достатъчно думи за да премине минималния праг от тридесет думи и така проверяваме дали филтърът за местоимения хваща българското начало правилно едно две три четири пет.",
    };
    expect(r(runChecks([bg], "https://x.example"), "G19")).toBe(0);
  });
  it("G8 heuristic is 0 on a page with no authorship signal (Phase 3 baseline)", () => {
    expect(r(run(``), "G8")).toBe(0);
  });
  it("Phase 3: a verified aux.semantic verdict overrides the heuristic for its GEO check", () => {
    expect(r(runChecks([page(``)], "https://x.example", { semantic: { G8: 1 } }), "G8")).toBe(1);
    expect(r(runChecks([page(``)], "https://x.example", { semantic: { G8: 0.5 } }), "G8")).toBe(0.5);
  });
  it("Phase 3: a null or absent semantic verdict leaves the heuristic untouched (fail-open)", () => {
    expect(r(runChecks([page(``)], "https://x.example", { semantic: { G8: null } }), "G8")).toBe(0);
    expect(r(runChecks([page(``)], "https://x.example", {}), "G8")).toBe(0);
  });
  it("T12 treats PostHog as a session recorder (ungated -> 0 when no CMP)", () => {
    // Recorder present + analytics visible (so the tracking layer IS assessable) + no CMP -> 0, a real
    // privacy finding. Locks the broadened recorder list. (A recorder alone, with no other tracking,
    // stays N/A by design - anyTracking would be false.)
    const head = `<script>posthog.init('x');</script><script src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1234"></script>`;
    expect(r(run(head), "T12")).toBe(0);
  });
});

describe("Tier-1 structural improvements", () => {
  const pw = (rawHtml: string, markdown = "Body text here.") =>
    ({ metadata: { sourceURL: "https://x.example/", title: "X" }, rawHtml, html: rawHtml, markdown }) as CrawledPage;
  const rendered = `<html><body>${"<p>Real content sentence here.</p>".repeat(40)}</body></html>`;

  it("G3 scores SSR high when the no-JS HTML matches the rendered DOM", () => {
    const c = runChecks([pw(rendered)], "https://x.example", { rootHtml: rendered });
    expect(r(c, "G3")).toBeGreaterThan(0.8);
  });
  it("G3 scores CSR low when the no-JS HTML is an empty shell", () => {
    const shell = `<html><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    const c = runChecks([pw(rendered)], "https://x.example", { rootHtml: shell });
    expect(r(c, "G3")).toBeLessThan(0.3);
  });
  it("G3 is N/A without a no-JS fetch (never guesses SSR)", () => {
    expect(r(runChecks([pw(rendered)], "https://x.example"), "G3")).toBeNull();
  });

  it("S17 flags a soft-404 (not-found H1 + thin content)", () => {
    expect(r(runChecks([pw(`<html><body><h1>404 - Page Not Found</h1></body></html>`, "Not found.")], "https://x.example"), "S17")).toBe(0);
  });
  it("S17 passes a normal content page", () => {
    expect(r(runChecks([pw(`<html><body><h1>Welcome</h1></body></html>`, "Lots of real content here. ".repeat(50))], "https://x.example"), "S17")).toBe(1);
  });

  it("G7 scores a recent date ~1 and a stale one low", () => {
    const recent = `<script type="application/ld+json">{"dateModified":"${new Date().toISOString()}"}</script>`;
    const stale = `<script type="application/ld+json">{"dateModified":"2009-01-01"}</script>`;
    expect(r(runChecks([pw(`<html><head>${recent}</head><body>x</body></html>`)], "https://x.example"), "G7")).toBe(1);
    expect(r(runChecks([pw(`<html><head>${stale}</head><body>x</body></html>`)], "https://x.example"), "G7")).toBeLessThan(0.3);
  });
});

/**
 * Tier-3 accuracy fixes (2026-05-28 multi-agent audit): false positives a paying reviewer
 * would catch. Each is mirrored in the n8n port and guarded by parity.test.ts.
 */
describe("Tier-3 accuracy fixes", () => {
  const rr = (checks: CheckResult[], id: string) => checks.find((c) => c.id === id)?.ratio ?? null;
  // Multi-page builder with explicit title/description/canonical/markdown control.
  const mp = (
    path: string,
    opts: { title?: string; desc?: string; canonical?: string; markdown?: string } = {},
  ): CrawledPage => {
    const head =
      (opts.title === undefined ? "" : `<title>${opts.title}</title>`) +
      (opts.desc === undefined ? "" : `<meta name="description" content="${opts.desc}">`) +
      (opts.canonical === undefined ? "" : `<link rel="canonical" href="${opts.canonical}">`);
    const rawHtml = `<!DOCTYPE html><html lang="en"><head>${head}</head><body><h1>H</h1></body></html>`;
    return {
      metadata: { sourceURL: `https://x.example${path}`, title: opts.title, description: opts.desc },
      rawHtml,
      html: rawHtml,
      markdown: opts.markdown ?? "Body.",
    };
  };

  // --- AE-1: S15/S16 must NOT reward all-missing meta as 100% unique ---
  it("S15/S16 are N/A (not a false 1.0) when NO page has a title / description", () => {
    const pages = [mp("/"), mp("/about"), mp("/contact")]; // no titles, no descriptions at all
    const c = runChecks(pages, "https://x.example");
    expect(rr(c, "S15")).toBeNull(); // uniqueness of zero titles is not assessable
    expect(rr(c, "S16")).toBeNull();
  });
  it("S15 = 1 when multiple pages have distinct titles", () => {
    const pages = [mp("/", { title: "Home - Acme" }), mp("/about", { title: "About - Acme" })];
    expect(rr(runChecks(pages, "https://x.example"), "S15")).toBe(1);
  });
  it("S15 penalizes duplicate titles across pages", () => {
    const pages = [mp("/", { title: "Acme" }), mp("/about", { title: "Acme" })];
    expect(rr(runChecks(pages, "https://x.example"), "S15")).toBe(0);
  });

  // --- AE-2: S23 must NOT false-fail a valid protocol-relative self-canonical ---
  it("S23 passes a protocol-relative self-canonical (//host/path)", () => {
    const p = mp("/p", { canonical: "//x.example/p" });
    expect(rr(runChecks([p], "https://x.example/"), "S23")).toBe(1);
  });
  it("S23 still fails a genuine protocol-relative cross-page canonical", () => {
    const p = mp("/p", { canonical: "//x.example/other" });
    expect(rr(runChecks([p], "https://x.example/"), "S23")).toBe(0);
  });

  // --- AE-3: S17 must NOT flag a thin ARTICLE whose topic is errors ---
  it("S17 does NOT flag a short article about 404 errors (>=50 words)", () => {
    const article = "How to fix a 404 error on your site. ".concat("A 404 means the page was not found. ".repeat(8));
    const p = mp("/blog/fix-404", { title: "How to fix a 404 error", markdown: article });
    // ~70 words, topic mentions 404/not found, but it is real content - must pass.
    expect(rr(runChecks([p], "https://x.example"), "S17")).toBe(1);
  });

  // --- AE-4: G6 must NOT count bare unit-suffixed numbers as statistics ---
  it("G6 does NOT count bare units (5m, 3x, 7k) as statistics", () => {
    const p = mp("/", { markdown: "Runs in 5m. Up to 3x. About 7k away. A 2m walk." });
    expect(rr(runChecks([p], "https://x.example"), "G6")).toBe(0); // <3 real stats
  });
  it("G6 counts real statistics (%, currency, magnitudes, ratios)", () => {
    const p = mp("/", { markdown: "40% faster, $2M raised, 10k active users, 3 in 5 teams agree." });
    expect(rr(runChecks([p], "https://x.example"), "G6")).toBe(1); // 4 real stats >= 3
  });
  it("G6 counts percentages ALONE (regression guard: % detection must not be dead)", () => {
    // Pins the AE-4 regression where a `\b` after % matched zero real percentages. The ONLY stats
    // here are percentages, so if % detection breaks again this drops to 0 and fails.
    const p = mp("/", { markdown: "Conversions up 23%, bounce down 40%, churn at 2.5% this quarter." });
    expect(rr(runChecks([p], "https://x.example"), "G6")).toBe(1); // 3 percentages clear the >=3 bar
  });
  it("G6 counts decimal magnitudes (1.5m) but still excludes bare single digits (5m)", () => {
    expect(rr(runChecks([mp("/", { markdown: "1.5m users, 2.5k teams, 7.3bn events handled." })], "https://x.example"), "G6")).toBe(1);
    expect(rr(runChecks([mp("/", { markdown: "a 5m walk, 3k away, a 2m ceiling" })], "https://x.example"), "G6")).toBe(0);
  });
});
