import { describe, it, expect } from "vitest";
import { runChecks } from "./checks";
import { scoreAudit } from "./scoring";
import type { CheckResult, CrawledPage } from "./types";

const ratio = (checks: CheckResult[], id: string) =>
  checks.find((c) => c.id === id)?.ratio ?? null;

const longBody = `Acme is the real-time analytics platform for modern teams. ${"insightful metric ".repeat(320)}`;

const goodPage: CrawledPage = {
  metadata: {
    title: "Acme - Real-time Analytics Dashboards for Teams",
    description:
      "Acme is a real-time analytics platform that helps teams track metrics, build dashboards and make data-driven decisions with speed and confidence every day.",
    sourceURL: "https://acme.example/",
    language: "en",
  },
  markdown: `Acme is a real-time analytics platform that helps product teams track metrics, build dashboards and make data-driven decisions in seconds.

Over 5,000 teams rely on Acme, and independent studies show 40% faster decisions and a 2x lift in retention. Plans start at $49/mo.

Key benefits:
- Real-time dashboards with sub-second refresh
- Consent-aware tracking built in
- Exportable reports and a full API

| Plan | Price | Seats |
| --- | --- | --- |
| Starter | $49 | 5 |
| Team | $99 | 20 |

See the [analytics overview on Wikipedia](https://en.wikipedia.org/wiki/Analytics) for background.

${longBody}`,
  rawHtml: `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<title>Acme Analytics Platform - Real-time Dashboards for Modern Teams</title>
<meta name="description" content="Acme is a real-time analytics platform.">
<link rel="canonical" href="https://acme.example/">
<meta property="og:title" content="Acme">
<link rel="icon" href="/favicon.ico">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}</script>
<script>gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});</script>
<script defer src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1234"></script>
<script defer src="https://www.googletagmanager.com/gtm.js?id=GTM-ABCDEF"></script>
<script defer src="https://consent.cookiebot.com/uc.js" data-cbid="x"></script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme","sameAs":["https://x.com/acme"],"author":"Acme","datePublished":"2026-01-01"}</script>
</head><body><h1>Acme is the analytics platform for modern teams</h1>
<img src="/logo.webp" alt="Acme logo" width="160" height="40" loading="lazy"></body></html>`,
};
goodPage.html = goodPage.rawHtml;

const badPage: CrawledPage = {
  metadata: { title: "Home", sourceURL: "http://insecure.example/" },
  markdown: "Welcome.",
  rawHtml: `<html><head><meta name="robots" content="noindex"><title>Home</title>
<img src="http://insecure.example/x.png"></head><body><h1>Hi</h1><h1>Two</h1>
<img src="/y.png"></body></html>`,
};
badPage.html = badPage.rawHtml;

describe("runChecks - well-built page", () => {
  // T20 reads aux.rootHtml (the no-JS source-of-truth); for the in-test "well-built page" the
  // page's static HTML IS the no-JS HTML, so we mirror it into aux.rootHtml.
  const checks = runChecks([goodPage], "https://acme.example/", { rootHtml: goodPage.rawHtml });
  it("passes the key SEO/structure checks", () => {
    expect(ratio(checks, "S1")).toBe(1); // title length ok
    expect(ratio(checks, "S3")).toBe(1); // canonical
    expect(ratio(checks, "S4")).toBe(1); // indexable
    expect(ratio(checks, "S5")).toBe(1); // one H1
    expect(ratio(checks, "S10")).toBe(1); // content depth
  });
  it("detects analytics & consent (incl. GTM-style)", () => {
    expect(ratio(checks, "T1")).toBe(1); // GA4
    expect(ratio(checks, "T3")).toBe(1); // GTM
    expect(ratio(checks, "T5")).toBe(1); // consent mode
    expect(ratio(checks, "T6")).toBe(1); // consent mode v2 (ad_user_data + ad_personalization)
    expect(ratio(checks, "T7")).toBe(1); // CMP (cookiebot)
  });
  it("passes GEO + tech basics", () => {
    expect(ratio(checks, "G1")).toBe(1); // JSON-LD
    expect(ratio(checks, "TB1")).toBe(1); // https
    expect(ratio(checks, "TB4")).toBe(1); // viewport
    expect(ratio(checks, "TB10")).toBe(1); // charset + lang
    expect(ratio(checks, "TB12")).toBe(1); // favicon
  });
  it("scores a high grade overall", () => {
    const r = scoreAudit(checks);
    expect(r.overall).toBeGreaterThanOrEqual(80);
    expect(["A", "B"]).toContain(r.grade);
    expect(r.capped).toBe(false);
  });
  it("passes the expanded 2026 checks", () => {
    expect(ratio(checks, "S15")).toBe(1); // unique titles
    expect(ratio(checks, "G11")).toBe(1); // typed Organization schema
    expect(ratio(checks, "G14")).toBe(1); // lists + table
    expect(ratio(checks, "G15")).toBe(1); // authoritative outbound citation (Wikipedia)
    expect(ratio(checks, "TB20")).toBe(1); // scripts deferred in <head>
    expect(ratio(checks, "TB22")).toBe(1); // HTML5 doctype
    expect(ratio(checks, "S23")).toBe(1); // canonical self-references
    expect(ratio(checks, "T20")).toBe(1); // consent default precedes the tag loaders
  });
});

describe("runChecks - broken page", () => {
  const checks = runChecks([badPage], "http://insecure.example/");
  it("flags the critical failures", () => {
    expect(ratio(checks, "S4")).toBe(0); // noindex
    expect(ratio(checks, "TB1")).toBe(0); // no https
    expect(ratio(checks, "TB4")).toBe(0); // no viewport
    expect(ratio(checks, "T1")).toBeNull(); // no tracking visible at all -> N/A (can't verify), not a 0
    // S5 is now "at least one H1" (>=1), so the bad page's two H1s correctly pass - it's no longer
    // a failure (multiple H1s are valid HTML5 per current Google guidance).
    expect(ratio(checks, "S5")).toBe(1);
  });
  it("scores F with critical-failure cap", () => {
    const r = scoreAudit(checks);
    expect(r.grade).toBe("F");
    expect(r.capped).toBe(true);
  });
});

describe("runChecks - robots / sitemap (aux)", () => {
  const url = "https://acme.example/";
  it("flags a site-wide robots.txt block + missing sitemap", () => {
    const checks = runChecks([goodPage], url, {
      robotsFetched: true,
      robotsTxt: "User-agent: *\nDisallow: /",
      sitemapFound: false,
    });
    expect(ratio(checks, "TB5")).toBe(0); // whole-site Disallow: / (critical)
    expect(ratio(checks, "S14")).toBe(0); // no sitemap
  });

  it("passes on a healthy robots + sitemap", () => {
    const checks = runChecks([goodPage], url, {
      robotsFetched: true,
      robotsTxt: "User-agent: *\nAllow: /\nSitemap: https://acme.example/sitemap.xml",
      sitemapFound: true,
    });
    expect(ratio(checks, "TB5")).toBe(1);
    expect(ratio(checks, "S14")).toBe(1);
    expect(ratio(checks, "G9")).toBe(1); // no AI crawler blocked
  });

  it("flags a blocked AI crawler without faulting the general crawl", () => {
    const checks = runChecks([goodPage], url, {
      robotsFetched: true,
      robotsTxt: "User-agent: GPTBot\nDisallow: /",
      sitemapFound: true,
    });
    expect(ratio(checks, "G9")).toBe(0); // GPTBot disallowed -> can't be cited by ChatGPT
    expect(ratio(checks, "TB5")).toBe(1); // the * group is untouched, so the site is still crawlable
  });

  it("reports robots/sitemap checks as N/A when aux is not provided", () => {
    const checks = runChecks([goodPage], url);
    expect(ratio(checks, "TB5")).toBeNull();
    expect(ratio(checks, "S14")).toBeNull();
    expect(ratio(checks, "G9")).toBeNull();
  });
});

describe("runChecks - security headers (aux)", () => {
  const url = "https://acme.example/";

  it("passes when the security headers are present", () => {
    const checks = runChecks([goodPage], url, {
      headersFetched: true,
      headers: {
        "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
        "content-security-policy": "default-src 'self'; frame-ancestors 'self'",
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        "permissions-policy": "geolocation=(), camera=()",
      },
    });
    expect(ratio(checks, "TB30")).toBe(1); // HSTS
    expect(ratio(checks, "TB31")).toBe(1); // CSP
    expect(ratio(checks, "TB32")).toBe(1); // nosniff
    expect(ratio(checks, "TB33")).toBe(1); // clickjacking via CSP frame-ancestors
    expect(ratio(checks, "TB34")).toBe(1); // Referrer-Policy
    expect(ratio(checks, "TB35")).toBe(1); // Permissions-Policy
  });

  it("fails missing headers; X-Frame-Options alone covers clickjacking; sniff value matters", () => {
    const checks = runChecks([goodPage], url, {
      headersFetched: true,
      headers: { "x-frame-options": "SAMEORIGIN", "x-content-type-options": "off" },
    });
    expect(ratio(checks, "TB30")).toBe(0); // no HSTS
    expect(ratio(checks, "TB31")).toBe(0); // no CSP
    expect(ratio(checks, "TB32")).toBe(0); // present but not "nosniff"
    expect(ratio(checks, "TB33")).toBe(1); // XFO present -> clickjacking covered even without CSP
    expect(ratio(checks, "TB35")).toBe(0); // no Permissions-Policy
  });

  it("reports security-header checks as N/A when headers were not fetched", () => {
    const checks = runChecks([goodPage], url);
    expect(ratio(checks, "TB30")).toBeNull();
    expect(ratio(checks, "TB31")).toBeNull();
    expect(ratio(checks, "TB33")).toBeNull();
    expect(ratio(checks, "TB35")).toBeNull();
  });
});

describe("runChecks - GTM-aware tracking (unverifiable -> N/A, not a score-lowering fail)", () => {
  const gtmOnly: CrawledPage = {
    metadata: { title: "Shop", sourceURL: "https://shop.example/" },
    rawHtml: `<!doctype html><html lang="en"><head><title>Shop home</title>
      <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script>
      </head><body><h1>Shop</h1></body></html>`,
  };
  gtmOnly.html = gtmOnly.rawHtml;

  it("marks GTM-injectable signals N/A when GTM is present but the tag is not in the HTML", () => {
    const checks = runChecks([gtmOnly], "https://shop.example/");
    expect(ratio(checks, "T3")).toBe(1); // GTM itself is directly detectable
    expect(ratio(checks, "T1")).toBeNull(); // analytics may be injected via GTM -> N/A, not 0
    expect(ratio(checks, "T5")).toBeNull(); // Consent Mode -> N/A
    expect(ratio(checks, "T6")).toBeNull(); // Consent Mode v2 -> N/A
    expect(ratio(checks, "T7")).toBeNull(); // CMP banner -> N/A
    expect(ratio(checks, "T8")).toBeNull(); // ad/social pixels -> N/A
  });

  it("marks the WHOLE tracking dimension N/A (excluded) when no tracking is visible at all", () => {
    const noTags: CrawledPage = {
      metadata: { sourceURL: "https://plain.example/" },
      rawHtml: "<!doctype html><html lang=\"en\"><head><title>Plain site here</title></head><body><h1>Hi</h1></body></html>",
    };
    noTags.html = noTags.rawHtml;
    const checks = runChecks([noTags], "https://plain.example/");
    expect(ratio(checks, "T1")).toBeNull(); // a crawl that sees no tracking layer -> N/A, never a 0
    expect(ratio(checks, "T5")).toBeNull();
    expect(scoreAudit(checks).dimensions.find((d) => d.id === "tracking")!.notApplicable).toBe(true);
  });

  it("flags a REAL gap (0) when SOME tracking is visible but analytics/consent are missing", () => {
    const partial: CrawledPage = {
      metadata: { sourceURL: "https://partial.example/" },
      // a CMP is present (the tracking layer IS visible) but there is no GA4 and no Consent Mode
      rawHtml: "<!doctype html><html lang=\"en\"><head><title>Partial tracking site</title><script src=\"https://consent.cookiebot.com/uc.js\"></script></head><body><h1>Hi</h1></body></html>",
    };
    partial.html = partial.rawHtml;
    const checks = runChecks([partial], "https://partial.example/");
    expect(ratio(checks, "T7")).toBe(1); // CMP detected -> the page is transparent
    expect(ratio(checks, "T1")).toBe(0); // analytics genuinely absent on a transparent page = real gap
    expect(ratio(checks, "T5")).toBe(0); // Consent Mode absent = real gap
  });

  it("recognizes first-party / server-side GTM (sGTM) - CMP stays N/A, not a false 'no banner'", () => {
    // A Framer-style sGTM site: the container is served from the site's OWN domain, so there is no
    // googletagmanager.com URL - only the noscript ns.html?id=GTM- iframe + a dataLayer push reveal GTM.
    // Before the regex fix this read as "no GTM", which (with dataLayer flipping anyTracking true) hard-
    // zeroed T7 on a site that demonstrably has a GTM-injected CMP. It must now be N/A.
    const sgtm: CrawledPage = {
      metadata: { sourceURL: "https://framer.example/" },
      rawHtml: `<!doctype html><html lang="en"><head><title>First-party sGTM site</title>
        <script>window.dataLayer=window.dataLayer||[];dataLayer.push({'gtm.start':1,event:'gtm.js'});</script></head>
        <body><noscript><iframe src="https://load.data.framer.example/ns.html?id=GTM-WHBJH3R"></iframe></noscript><h1>Hi</h1></body></html>`,
    };
    sgtm.html = sgtm.rawHtml;
    const checks = runChecks([sgtm], "https://framer.example/");
    expect(ratio(checks, "T3")).toBe(1); // GTM detected via first-party id=GTM- (no googletagmanager.com)
    expect(ratio(checks, "T7")).toBeNull(); // CMP is GTM-injected + invisible to the crawl -> N/A, not 0
  });
});

describe("runChecks - detection fixes (T1 config form, TB3 sub-resources)", () => {
  const page = (rawHtml: string): CrawledPage => {
    const p: CrawledPage = { metadata: { sourceURL: "https://x.example/" }, rawHtml };
    p.html = rawHtml;
    return p;
  };

  it("detects GA4 configured via gtag('config', ...) without the loader URL", () => {
    const p = page(
      `<html><head><script>window.dataLayer=[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-1A2B3C4D5E');</script></head><body></body></html>`,
    );
    expect(ratio(runChecks([p], "https://x.example/"), "T1")).toBe(1);
  });

  it("does not flag an http <a> navigation link as mixed content", () => {
    const p = page(
      `<html><body><a href="http://external.example/page">external</a><img src="/local.png"></body></html>`,
    );
    expect(ratio(runChecks([p], "https://x.example/"), "TB3")).toBe(1);
  });

  it("still flags an insecure http sub-resource (img src) as mixed content", () => {
    const p = page(`<html><body><img src="http://insecure.example/x.png"></body></html>`);
    expect(ratio(runChecks([p], "https://x.example/"), "TB3")).toBe(0);
  });
});

describe("runChecks - T12 (recorder consent) + TB20 (head extraction) edge cases", () => {
  const page = (rawHtml: string, sourceURL = "https://x.example/"): CrawledPage => {
    const p: CrawledPage = { metadata: { sourceURL }, rawHtml };
    p.html = rawHtml;
    return p;
  };

  // T12: a session recorder with NO visible CMP but GTM present -> N/A (the CMP may be GTM-injected and
  // invisible to a crawl), mirroring T7 - NOT a hard 0. This was the false-positive being fixed.
  it("T12: recorder + no CMP + GTM present -> N/A (not a 0)", () => {
    const p = page(
      `<!doctype html><html lang="en"><head><title>Recorder via GTM site</title>
        <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script>
        <script src="https://www.clarity.ms/tag/abc"></script></head><body><h1>Hi</h1></body></html>`,
    );
    expect(ratio(runChecks([p], "https://x.example/"), "T12")).toBeNull();
  });

  it("T12: recorder + no CMP + NO GTM (but other tracking visible) -> real gap (0)", () => {
    // A recorder + a GA4 tag inline, no CMP, no GTM container that could hide one -> a genuine, visible
    // ungated recorder. Still a real 0.
    const p = page(
      `<!doctype html><html lang="en"><head><title>Ungated recorder site</title>
        <script src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1234"></script>
        <script src="https://www.clarity.ms/tag/abc"></script></head><body><h1>Hi</h1></body></html>`,
    );
    expect(ratio(runChecks([p], "https://x.example/"), "T12")).toBe(0);
  });

  it("T12: recorder + CMP present -> pass (1)", () => {
    const p = page(
      `<!doctype html><html lang="en"><head><title>Gated recorder site</title>
        <script src="https://consent.cookiebot.com/uc.js"></script>
        <script src="https://www.clarity.ms/tag/abc"></script></head><body><h1>Hi</h1></body></html>`,
    );
    expect(ratio(runChecks([p], "https://x.example/"), "T12")).toBe(1);
  });

  // TB20: when the <head> cannot be isolated (no <head> in rawHtml), the check is N/A, NOT a vacuous
  // pass. Previously it fell back to head-stripped html(p) and `[].every(...)` returned true (1).
  it("TB20: N/A when the <head> block cannot be extracted (no vacuous pass)", () => {
    const noHead = page(`<html><body><script src="https://cdn.example/blocking.js"></script><h1>Hi</h1></body></html>`);
    expect(ratio(runChecks([noHead], "https://x.example/"), "TB20")).toBeNull();
  });

  it("TB20: fails (0) when an extractable <head> has a synchronous render-blocking script", () => {
    const blocking = page(`<html><head><script src="https://cdn.example/blocking.js"></script></head><body></body></html>`);
    expect(ratio(runChecks([blocking], "https://x.example/"), "TB20")).toBe(0);
  });

  it("TB20: passes (1) when an extractable <head> has only async/defer/module scripts", () => {
    const ok = page(`<html><head><script defer src="https://cdn.example/a.js"></script><script type="module" src="https://cdn.example/b.js"></script></head><body></body></html>`);
    expect(ratio(runChecks([ok], "https://x.example/"), "TB20")).toBe(1);
  });
});

describe("runChecks - GEO additions (G16-G20)", () => {
  const geoPage: CrawledPage = {
    metadata: { title: "Acme Analytics", sourceURL: "https://acme.example/about", language: "en" },
    markdown: `## Key takeaways
- Acme is a real-time analytics platform
- Plans start at $49/mo
- SOC 2 certified

## What is Acme?
Acme is a real-time analytics platform that helps product teams track key metrics, build shareable dashboards, and make data-driven decisions in seconds rather than waiting days for a central data team to assemble a weekly report by hand.

## How much does Acme cost?
Acme pricing starts at forty nine dollars per month for up to five seats on the Starter plan, and every paid plan includes a fourteen day free trial that needs no credit card to begin, so teams can evaluate the product first.`,
    rawHtml: `<!DOCTYPE html><html lang="en"><head><title>Acme Analytics</title>
<meta property="og:site_name" content="Acme">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme","sameAs":["https://en.wikipedia.org/wiki/Acme","https://www.linkedin.com/company/acme"]}</script>
</head><body></body></html>`,
  };
  geoPage.html = geoPage.rawHtml;

  it("scores the GEO structure signals on a well-formed page", () => {
    const checks = runChecks([geoPage], "https://acme.example/about");
    expect(ratio(checks, "G17")).toBe(1); // brand agrees: og:site_name + Organization name both "Acme"
    expect(ratio(checks, "G18")).toBe(1); // sameAs includes a Wikipedia URL
    expect(ratio(checks, "G19")).toBeGreaterThan(0.6); // 2 of 3 H2 sections open with a direct answer
    expect(ratio(checks, "G20")).toBe(1); // TL;DR / Key takeaways block near the top
  });

  it("reports llms.txt by aux (N/A when not fetched)", () => {
    const url = "https://acme.example/about";
    expect(ratio(runChecks([geoPage], url, { llmsTxtFound: true }), "G16")).toBe(1);
    expect(ratio(runChecks([geoPage], url, { llmsTxtFound: false }), "G16")).toBe(0);
    expect(ratio(runChecks([geoPage], url), "G16")).toBeNull();
  });

  it("does not award the GEO structure signals on a page that lacks them", () => {
    const checks = runChecks([badPage], "http://insecure.example/");
    expect(ratio(checks, "G17")).toBeNull(); // no brand declared anywhere -> consistency not assessable
    expect(ratio(checks, "G18")).toBe(0); // no sameAs
    expect(ratio(checks, "G19")).toBe(0); // no H2 sections
    expect(ratio(checks, "G20")).toBe(0); // no TL;DR block
  });
});

describe("runChecks - GTM container ground truth (aux.gtm)", () => {
  const gtmSite: CrawledPage = {
    metadata: { title: "Shop home page here", sourceURL: "https://shop.example/" },
    rawHtml: `<!doctype html><html lang="en"><head><title>Shop home page here</title>
      <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script>
      </head><body><h1>Shop</h1></body></html>`,
  };
  gtmSite.html = gtmSite.rawHtml;

  it("VERIFIES analytics + consent from the parsed container (not N/A)", () => {
    const checks = runChecks([gtmSite], "https://shop.example/", {
      gtm: { ga4: ["G-ABC1234567"], adwords: [], ua: false, consent: true, consentV2: true, pixels: false },
    });
    expect(ratio(checks, "T1")).toBe(1); // GA4 configured in the container -> verified present
    expect(ratio(checks, "T5")).toBe(1); // Consent Mode signals in the container
    expect(ratio(checks, "T6")).toBe(1); // Consent Mode v2 in the container
    expect(ratio(checks, "T3")).toBe(1); // GTM itself (directly visible)
  });

  it("reports a REAL gap (0) for signals absent from the container (verified, not N/A)", () => {
    const checks = runChecks([gtmSite], "https://shop.example/", {
      gtm: { ga4: ["G-ABC1234567"], adwords: [], ua: false, consent: false, consentV2: false, pixels: false },
    });
    expect(ratio(checks, "T1")).toBe(1); // analytics present
    expect(ratio(checks, "T5")).toBe(0); // no Consent Mode in the container -> a real, verified gap
    expect(ratio(checks, "T6")).toBe(0); // no Consent Mode v2 -> real gap
  });

  it("stays N/A without the container (GTM present but its config is unverifiable)", () => {
    const checks = runChecks([gtmSite], "https://shop.example/");
    expect(ratio(checks, "T1")).toBeNull();
    expect(ratio(checks, "T5")).toBeNull();
  });
});

describe("runChecks - canonical mismatch (S23) + consent ordering (T20)", () => {
  const page = (rawHtml: string, sourceURL = "https://x.example/p"): CrawledPage => {
    const p: CrawledPage = { metadata: { sourceURL }, rawHtml };
    p.html = rawHtml;
    return p;
  };

  it("S23: self-canonical or none passes; a different-path canonical fails", () => {
    const self = page('<html><head><link rel="canonical" href="https://x.example/p"></head><body></body></html>');
    expect(ratio(runChecks([self], "https://x.example/"), "S23")).toBe(1);
    const none = page("<html><head></head><body></body></html>");
    expect(ratio(runChecks([none], "https://x.example/"), "S23")).toBe(1);
    const mismatch = page('<html><head><link rel="canonical" href="https://x.example/other"></head><body></body></html>');
    expect(ratio(runChecks([mismatch], "https://x.example/"), "S23")).toBe(0);
  });

  it("S23: ignores trailing-slash / query / scheme / www differences", () => {
    const p = page('<html><head><link rel="canonical" href="http://www.x.example/p/?utm=1"></head><body></body></html>');
    expect(ratio(runChecks([p], "https://x.example/"), "S23")).toBe(1);
  });

  // T20 reads aux.rootHtml (the no-JS source-of-truth). For each fixture below we mirror the page's
  // static HTML into both the page object AND aux.rootHtml so the check sees what it would see in a
  // real audit where the n8n "Fetch headers" node provides the no-JS GET body.
  const t20 = (rawHtml: string) => {
    const p = page(rawHtml);
    return ratio(runChecks([p], "https://x.example/", { rootHtml: rawHtml }), "T20");
  };

  it("T20: consent-before-loader passes, loader-before-consent fails, not-inline is N/A", () => {
    const before = '<html><head><script>gtag(\'consent\',\'default\',{ad_storage:\'denied\'})</script><script src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script></head><body></body></html>';
    expect(t20(before)).toBe(1);
    const after = '<html><head><script src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script><script>gtag(\'consent\',\'default\',{ad_storage:\'denied\'})</script></head><body></body></html>';
    expect(t20(after)).toBe(0);
    const gtmOnly = '<html><head><script src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script></head><body></body></html>';
    expect(t20(gtmOnly)).toBeNull();
  });

  it("T20: standard GTM snippet (URL appears as a STRING inside the inline IIFE)", () => {
    // Google's official GTM snippet has the gtm.js URL as a string literal inside an inline
    // bootstrap function - there is NO <script src=> tag in static HTML. The consent default must
    // still appear before that snippet's body in source order.
    const goodSnippet = `<html><head>
      <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
      gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});</script>
      <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
      var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;
      j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer','GTM-XXXXXX');</script>
      </head><body></body></html>`;
    expect(t20(goodSnippet)).toBe(1);

    // The same snippet with the bootstrap moved ABOVE the consent default is the real privacy bug:
    // the URL string still appears inside the snippet body but now earlier in the document.
    const badSnippet = `<html><head>
      <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
      var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;
      j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer','GTM-XXXXXX');</script>
      <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
      gtag('consent','default',{ad_storage:'denied'});</script>
      </head><body></body></html>`;
    expect(t20(badSnippet)).toBe(0);
  });

  it("T20: same-script setup (default + loader URL in the same inline body) - order inside the body counts", () => {
    const sameScriptOk = `<html><head>
      <script>
        window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
        gtag('consent','default',{ad_storage:'denied'});
        // GTM bootstrap inlined right below in the SAME tag
        (function(w,d,s,l,i){var j=d.createElement(s);j.src='https://www.googletagmanager.com/gtm.js?id='+i;
        d.head.appendChild(j);})(window,document,'script','dataLayer','GTM-ZZ');
      </script></head><body></body></html>`;
    expect(t20(sameScriptOk)).toBe(1);
  });

  it("T20: multiple gtag/js loaders - the FIRST one is what the consent default must precede", () => {
    const multi = `<html><head>
      <script>gtag('consent','default',{ad_storage:'denied'});</script>
      <script async src="https://www.googletagmanager.com/gtag/js?id=G-AAAAAAAAA1"></script>
      <script async src="https://www.googletagmanager.com/gtag/js?id=G-BBBBBBBBB2"></script>
      </head><body></body></html>`;
    expect(t20(multi)).toBe(1);
  });

  it("T20: gtag.js (Google tag) direct loader patterns - both good and bad orderings", () => {
    const good = '<html><head><script>gtag(\'consent\',\'default\',{ad_storage:\'denied\'})</script><script async src="https://www.googletagmanager.com/gtag/js?id=G-X82LR0DK3V"></script></head><body></body></html>';
    expect(t20(good)).toBe(1);
    const bad = '<html><head><script async src="https://www.googletagmanager.com/gtag/js?id=G-X82LR0DK3V"></script><script>gtag(\'consent\',\'default\',{ad_storage:\'denied\'})</script></head><body></body></html>';
    expect(t20(bad)).toBe(0);
  });

  it("T20: server-side GTM on a custom domain is N/A (custom host, not googletagmanager.com)", () => {
    // First-party server-side GTM has a different deployment + consent model; T20's static
    // source-order heuristic isn't meaningful, so we report N/A rather than guess.
    const sgtm = '<html><head><script>gtag(\'consent\',\'default\',{ad_storage:\'denied\'})</script><script async src="https://gtm.mysite.example/gtm.js?id=GTM-Z"></script></head><body></body></html>';
    expect(t20(sgtm)).toBeNull();
  });

  it("T20: CMP-managed consent without a literal gtag('consent','default') in static HTML is N/A", () => {
    // Cookiebot / OneTrust / etc. inject the consent default at runtime; nothing about it is in the
    // static HTML, so the check honestly reports N/A.
    const cmp = '<html><head><script src="https://consent.cookiebot.com/uc.js?cbid=x"></script><script async src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script></head><body></body></html>';
    expect(t20(cmp)).toBeNull();
  });

  it("T20: aux.rootHtml missing (root fetch failed) -> N/A even if the page has the markers", () => {
    // If the no-JS root fetch failed we have no honest source for the order check. We must NOT fall
    // back to the (rendered) per-page HTML, because Firecrawl's rawHtml is post-render in production
    // and the gtag.js loader is injected to the top of <head> there - which would false-fail a
    // correctly configured site. Better to report N/A than report a wrong answer.
    const p = page('<html><head><script>gtag(\'consent\',\'default\',{ad_storage:\'denied\'})</script><script async src="https://www.googletagmanager.com/gtag/js?id=G-X"></script></head><body></body></html>');
    expect(ratio(runChecks([p], "https://x.example/"), "T20")).toBeNull();
    expect(ratio(runChecks([p], "https://x.example/", { rootHtml: "" }), "T20")).toBeNull();
  });

  it("T20: tolerates whitespace, mixed quotes and case inside the gtag(...) call", () => {
    const spaced = `<html><head>
      <script>gtag(  "consent" ,  "default" , { ad_storage: 'denied' })</script>
      <script async src="https://www.googletagmanager.com/gtag/js?id=G-X"></script>
      </head><body></body></html>`;
    expect(t20(spaced)).toBe(1);
  });
});
