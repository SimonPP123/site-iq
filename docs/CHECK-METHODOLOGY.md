# Site IQ - Check Methodology and Honest Limitations

For every one of the 58 deterministic checks: **how it is verified**, **whether that is the best feasible method**, the **edge cases** that can fool it (false positives / negatives), and a **reliability flag** - including, explicitly, where a static crawl **cannot** verify something.

This describes the engine **as it runs in production today**. Accuracy improvements identified during this audit are listed, clearly marked as not-yet-shipped, in the **Recommended improvements** section at the end - none of them are claimed as done here.

Source of truth: `src/lib/audit/checks.ts` (the n8n "Run checks" node is a verified 1:1 port, guarded by `parity.test.ts`).

---

## How the data is gathered (this shapes every check)

Up to **10 pages** (homepage + up to 9 internal URLs the homepage links to) are fetched via Firecrawl `/v2/batch/scrape` with `waitFor:2500ms`, `proxy:basic`, `maxAge:0` (live), `onlyMainContent:false`. Each page yields `rawHtml` (full, ~1MB, post-render), `html` (cleaned), `markdown`, `links[]`. `robots.txt`, `sitemap.xml`, `llms.txt` are fetched separately; the **root URL** is fetched once more for response headers; and the public **GTM container** (`gtm.js?id=GTM-...`) is fetched when a container id is found.

Five consequences that recur as flags below (verified empirically against live sites today):

1. **Firecrawl renders JavaScript.** `rawHtml`/`html` are the post-render DOM, not the wire response. Good for most checks, but it makes "is this server-rendered?" inherently hard (see **G3**).
2. **Response headers are fetched for the root URL only** (the scrape returns none). Every header-based check (TB30-35) sees only the homepage's headers.
3. **Runtime, consent-gated tags often never appear** even with `waitFor:2500` (confirmed: one live site showed no GA4/GTM at all; another showed the GTM container but not the GA4 id it injects). Tracking compensates with GTM-container ground truth + a confidence model that returns **N/A, never a false zero**.
4. **Cross-page claims are sampled** (the <=10 crawled pages, not the whole site).
5. **Presence is not quality** (`alt="image"` passes; an empty H1 passes).

Two honesty mechanisms are built in: **N/A renormalization** (a check whose input could not be gathered is excluded from the score, never 0) and the **critical floor** (only S4, TB1, TB4, TB5 can floor a grade).

Reliability legend: **HIGH** (robust), **MEDIUM** (good signal, known edges), **LOW** (heuristic / not statically verifiable - flagged).

---

## SEO (15)

- **S1 - Title 15-60 chars.** Firecrawl-parsed `metadata.title`, per-page. Best-method caveat: the cap is **characters, not pixels** (`checks.ts:173`). Edge: 14-char brand titles fail; Google rewrites ~33% of titles. **MEDIUM.**
- **S2 - Meta description 70-160.** Same shape (`checks.ts:175`). Edge: value may be an `og:description` fallback; Google rewrites snippets. **MEDIUM.**
- **S3 - Canonical present.** Regex in rawHtml+html (`checks.ts:177`). **FLAG:** a canonical via HTTP `Link:` header is invisible. **MEDIUM-HIGH.**
- **S4 - Indexable (no noindex). [critical, 12]** Detects `<meta name="robots"|"googlebot" ... noindex>` in either attribute order (`checks.ts:179`). **FLAG (floor-triggering):** an `X-Robots-Tag` HTTP-header noindex is still not visible to the scrape. **MEDIUM-HIGH.**
- **S5 - >=1 H1.** Counts `<h1` in rendered html (`checks.ts:181`). Edge: image-only / empty / ARIA H1. **HIGH.**
- **S10 - Content depth >=300 words.** Word count on markdown (`checks.ts:183`). **FLAG:** whitespace split **undercounts CJK/Thai**; short page types (pricing/login) penalized; 300 is a soft norm. **MEDIUM.**
- **S12 - Open Graph.** Checks `og:title` OR `og:image` (`checks.ts:185`). Edge: `name=` instead of `property=`; Twitter-card-only sites. **MEDIUM-HIGH.**
- **S13 - Image alt coverage.** Honest ratio of `<img>` with `alt=` (`checks.ts:187`). Edge: `alt=""` counts; quality not judged. **MEDIUM-HIGH.**
- **S14 - XML sitemap present.** `/sitemap.xml` 200 OR robots `Sitemap:` line. **FLAG:** sitemaps at non-standard paths (e.g. `/sitemap_index.xml`) not declared in robots are missed; soft-404s pass. **MEDIUM-HIGH.**
- **S15 - Unique titles (cross-page).** Uniqueness ratio over sampled titles (`checks.ts:195`). **FLAG (sampling ceiling):** across the <=10 crawled pages, not the site. **MEDIUM-HIGH for the sample, LOW site-wide.**
- **S16 - Unique meta descriptions.** Same engine + sampling caveat; empty descriptions not counted as duplicates. **MEDIUM / LOW site-wide.**
- **S17 - Sampled pages return OK (no 4xx/5xx or soft-404).** Flags 4xx/5xx AND soft-404s (a not-found title/H1 on a thin page) (`checks.ts:203`). **FLAG:** still only the <=10 sampled pages - Firecrawl drops failed URLs, so broken internal LINKS outside the sample are not found (an internal-link HEAD-probe is the roadmap). **MEDIUM.**
- **S18 - Logical heading hierarchy.** Detects level-skips; requires exactly one H1 (`checks.ts:208`). **FLAG:** "exactly 1 H1" conflicts with S5 (>=1) and valid HTML5 multi-H1. **MEDIUM-HIGH.**
- **S21 - Valid hreflang.** N/A when none present; now accepts script subtags (`zh-Hant`) and 3-letter codes (`fil`) (`checks.ts:217`). **FLAG:** it still accepts shape-valid nonsense (`zz-zz` is not a real ISO code); hreflang in HTTP headers / XML sitemap and return-link reciprocity are not checked. **MEDIUM.**
- **S23 - Canonical resolves to this page.** Normalizes then compares to self (`checks.ts:227`). **FLAG:** intentional cross-domain canonicals (syndication) read as a mismatch. **MEDIUM-HIGH.**

---

## Tracking and Analytics (10)

Engineered with deliberate humility: a crawl cannot prove a tag is **absent**, so every miss is **N/A (excluded), never a false zero**, and the whole dimension drops from the overall if nothing is visible. The decisive upgrade is **GTM-container ground truth** (`gtm.js?id=GTM-...` lists what the container fires, so consent-gated analytics/consent become verified). The AI summary is hard-instructed never to claim "no analytics" from a crawl.

- **T1 - Analytics present.** Inline GA4/gtag/Plausible/Fathom/Matomo, or the GTM container lists GA4/Ads (`checks.ts:248`). **FLAG (highest false-negative surface):** server-side GTM, CNAME-proxied GA4, Measurement Protocol, Segment/Tealium are invisible -> **N/A**, not penalized. **MEDIUM-HIGH.**
- **T2 - No legacy Universal Analytics.** `UA-` / `analytics.js` inline or container (`checks.ts:249`). UA is dead since 2024 -> high-signal. **HIGH.**
- **T3 - Google Tag Manager.** Positive-only (absent -> N/A). Catches first-party `?id=GTM-` (`checks.ts:251`). **HIGH** (cannot false-penalize).
- **T5 - Consent Mode present.** Inline `gtag('consent')` or container `analytics_storage`/`ad_storage` (`checks.ts:253`). **FLAG:** the container proves **configuration, not runtime behaviour**. **MEDIUM-HIGH.**
- **T6 - Consent Mode v2.** Both `ad_user_data`+`ad_personalization` (`checks.ts:254`). **FLAG:** presence != correct values/timing; does not validate the live signal. **MEDIUM.**
- **T7 - Consent / CMP banner.** ~18 named CMP vendors, N/A-not-zero (`checks.ts:256`). **FLAG (high false-negative):** custom in-house banners and TCF-only/unlisted CMPs are missed. **MEDIUM.**
- **T8 - Ad/social pixels.** Major networks, informational, N/A-not-zero (`checks.ts:257`). **FLAG:** server-side CAPI / Events API leaves no client fingerprint. **MEDIUM.**
- **T12 - Session recording gated by consent.** Recorder + CMP -> pass; recorder + no CMP -> fail (`checks.ts:258`). **FLAG (its false positive is a legal exposure):** proves **co-presence, not causal gating**. Frame as "verify gating". **LOW-MEDIUM.**
- **T15 - dataLayer initialized.** Positive-only presence (`checks.ts:262`). **HIGH.**
- **T20 - Consent default before tags load.** Source-order of `gtag('consent','default')` vs the loader, inline-only (`checks.ts:264`). The one consent-timing fact a crawl can prove. **FLAG:** GTM-managed timing is N/A; `wait_for_update` adequacy not checked. **HIGH for what it asserts.**

---

## AI-Readiness / GEO (17)

- **G1 - JSON-LD present.** Regex for `application/ld+json` (`checks.ts:283`). **FLAG:** not validity-parsed; "present after JS" is more generous than a no-JS AI crawler sees. **HIGH for presence.**
- **G3 - Server-side rendered content. [heaviest GEO weight 14]** Compares the NO-JS initial HTML (a plain GET of the root, captured by the headers fetch) to the rendered DOM (`checks.ts:287`): a near-empty no-JS shell that only fills in after JS scores low (CSR); a server-rendered page scores high. Verified live (an SSR site -> 1). **FLAG:** homepage-level only (one no-JS fetch); N/A without it. **MEDIUM-HIGH.**
- **G4 - Direct-answer opening.** First prose line is a 60-400 char terminal-punctuated sentence (`checks.ts:293`). **FLAG:** judges shape, not whether it answers; heading-first answers penalized. **MEDIUM.**
- **G5 - Q&A / FAQ structure.** `FAQPage`/`Question` schema or a `?`-heading (`checks.ts:308`). Edge: one rhetorical `?` heading passes. **MEDIUM-HIGH (schema) / MEDIUM (heading).**
- **G6 - Statistics & data points.** Counts numbers+units, >=3 (`checks.ts:310`). **FLAG:** counts numeric tokens, not cited data (the `m`/`k`/`x` unit over-match is now cut by a no-trailing-letter guard). **MEDIUM.**
- **G7 - Freshness signals.** Parses the declared `dateModified`/`datePublished`/`<time datetime>` and scores by recency (<=90d -> 1, decaying to 0.1 by ~2y) (`checks.ts:322`). **FLAG:** only as good as the declared date; a page with no date scores 0. **MEDIUM.**
- **G8 - Authorship / E-E-A-T.** Matches `author`/`sameAs`/`Organization` strings (`checks.ts:324`). **FLAG:** very loose - any Organization schema passes "authorship"; overlaps G11/G18. **LOW-MEDIUM.**
- **G9 - AI crawlers not blocked.** robots.txt named-bot `Disallow: /` (15-bot list) (`checks.ts:326`). **FLAG:** only a whole-site root block is caught; partial-path blocks and WAF/CDN bot rules are not. **HIGH for the exact case.**
- **G11 - Typed schema entities.** Type + key properties required (`checks.ts:328`). Strongest GEO check. **FLAG (minor):** property match is page-scoped, not object-scoped. **HIGH.**
- **G12 - Snippet-eligible (no nosnippet).** Checks the `<meta>` robots tag AND the root `X-Robots-Tag` response header (`checks.ts:340`). **FLAG:** `data-nosnippet` element attributes, and `X-Robots-Tag` on subpages, are not checked. **MEDIUM-HIGH.**
- **G14 - Extractable formatting.** >=3 list items or a table (`checks.ts:344`). **FLAG:** nav/footer lists inflate it. **MEDIUM-HIGH.**
- **G15 - Outbound authoritative citations.** Links to `.gov/.edu/.int` or a small allowlist (`checks.ts:352`). **FLAG:** the allowlist is narrow (Reuters/FT/arXiv/IEEE/Gartner/Statista etc. score 0); only markdown links parsed. **MEDIUM.**
- **G16 - llms.txt present.** `/llms.txt` 200 (`checks.ts:371`). Detection HIGH, but **FLAG (signal value):** ~10% adoption, ~0.1% of AI-bot requests, no proven citation lift in May 2026 - correctly weighted 2/low.
- **G17 - Entity consistency.** Brand agreement across og:site_name / Organization / title (`checks.ts:375`). **FLAG (minor):** 300-char org-name window + arbitrary partial-credit constants. **MEDIUM-HIGH.**
- **G18 - Organization sameAs.** Wikipedia/Wikidata or >=2 URLs (`checks.ts:399`). **FLAG:** "2 arbitrary URLs" passes; only the Wikipedia/Wikidata arm is strong. **MEDIUM-HIGH.**
- **G19 - Sections open with a direct answer (per H2).** Fraction of H2 sections with a 30-130-word non-pronoun opener (`checks.ts:407`). Best-designed GEO heuristic. **FLAG:** no-H2 pages score 0; the filler-word screen now covers EN + common Western-EU pronouns (CJK still out of scope). **MEDIUM.**
- **G20 - TL;DR near top.** Summary-style heading + a list in the top quarter (`checks.ts:432`). **FLAG:** phrase list now EN + common Western-EU terms; bullet-less summaries still miss. **MEDIUM.**

---

## Tech Basics (16)

- **TB1 - HTTPS. [critical, 16]** Final URL scheme (`checks.ts:446`). **FLAG (minor):** confirms reachability, not TLS/cert validity. **HIGH.**
- **TB3 - No mixed content.** Insecure sub-resources on https pages (`checks.ts:450`). **FLAG:** sampled pages only; external-stylesheet contents not seen. **MEDIUM.**
- **TB4 - Mobile viewport. [critical, 14]** `<meta viewport>` (`checks.ts:462`). Edge: present-but-broken value passes. **HIGH.**
- **TB5 - robots.txt allows crawling. [critical, 8]** Whole-site `Disallow: /` in the `*` group (`checks.ts:448`). **FLAG:** a Googlebot-specific block is not caught; a failed fetch is treated as allow-all. **MEDIUM-HIGH.**
- **TB6 - Layout stability (CLS proxy).** `<img>` with width+height/aspect-ratio (`checks.ts:470`). **FLAG:** a static proxy, **not** measured CLS; CSS-class sizing penalized; non-image CLS ignored. **MEDIUM.**
- **TB10 - Charset & lang declared.** `<meta charset>` + `<html lang>` (`checks.ts:464`). **FLAG (minor):** charset via HTTP header is a false negative. **MEDIUM-HIGH.**
- **TB12 - Favicon.** `<link rel=...icon>` (`checks.ts:466`). **FLAG (minor):** the implicit root `/favicon.ico` fallback is not considered. **MEDIUM.**
- **TB19 - Modern image formats & lazy-loading.** `.webp/.avif` + `loading="lazy"` (`checks.ts:486`). **FLAG:** JS lazy-loading and `Accept`-negotiated WebP are invisible. **MEDIUM.**
- **TB20 - No render-blocking head scripts.** External head `<script src>` must be async/defer/module; uses rawHtml (`checks.ts:479`). **FLAG:** render-blocking CSS and synchronous inline head scripts not measured. **MEDIUM-HIGH.**
- **TB22 - Valid HTML5 doctype.** rawHtml starts with `<!doctype html>` (`checks.ts:496`). **FLAG (minor):** a pre-doctype HTML comment causes a false negative (a leading BOM is fine - JS `\s` already matches U+FEFF). **HIGH.**
- **TB30-35 - Security headers (HSTS / CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy).** (`checks.ts:503-514`) **SHARED FLAG (important):** all read the **root URL's headers only** (no subpage is header-checked). TB30 (HSTS, parses `max-age`), TB31 (CSP, penalises `unsafe-inline`/`unsafe-eval`) and TB32 (nosniff value) are now value-aware; TB33-35 remain presence-only (so `Referrer-Policy: unsafe-url` or `frame-ancestors *` still pass). **MEDIUM (TB30/31/32 HIGH).**

---

## Cross-cutting limitations (disclosed, by design)

1. **<=10-page sample, homepage-reachable** - all cross-page/per-page claims describe that sample, not the whole site.
2. **No per-page HTTP headers** - header checks see the homepage only.
3. **Render-time ambiguity** - "present" means "present after ~2.5s of rendering", more generous than a no-JS crawler (the reason G3 is hard).
4. **Tracking is configuration-aware, not behaviour-aware** - the GTM container proves what is configured to fire, not that it fires correctly behind real consent.
5. **Presence != quality and != live SERP** - length/recency/citation checks measure hygiene markers.
6. **Static performance proxies, not Core Web Vitals** (TB6/19/20).

The deliberate design response: N/A renormalization, the tracking confidence model (never a false zero), the critical floor limited to the four high-confidence signals (S4, TB1, TB4, TB5), and an AI summary instructed to caveat rather than over-claim.

---

## Recommended improvements (NOT yet shipped - prioritised)

Found in this audit; each is a concrete, safe change. Tiered by impact/effort.

### Shipped in this pass (engine + n8n port, deployed live, regression-tested)
- **S4 (noindex):** now also matches `name="googlebot"` and reversed attribute order (`content` before `name`). (The `X-Robots-Tag` HTTP-header path is still unverifiable from the scrape.)
- **S12 (OG):** now accepts `og:title` OR `og:image`, matching the "Open Graph tags" label.
- **S21 (hreflang):** validity regex now accepts script subtags (`zh-Hant`) and 3-letter codes (`fil`).
- **G12 (snippet):** now also reads the root `X-Robots-Tag` response header for `nosnippet`/`max-snippet:0`.
- **G15 (citations):** authoritative allowlist broadened (Reuters, FT, arXiv, IEEE, Gartner, Statista, McKinsey).
- **Fingerprints:** T8 +Snapchat; T12 +PostHog/LogRocket/Smartlook/Inspectlet/Lucky Orange; T7 +IAB `__tcfapi`.
- **TB30 (HSTS):** value-aware - a disabling `max-age=0` no longer passes; full credit needs >=1 year.
- **TB31 (CSP):** value-aware - a CSP with `unsafe-inline`/`unsafe-eval` gets partial credit, not full.
- **G3 (SSR) [Tier-1]:** now compares the NO-JS initial HTML (the headers fetch body) to the rendered DOM, so it genuinely distinguishes SSR from CSR instead of always passing. Verified live (SSR site -> 1).
- **S17 (broken pages) [Tier-1]:** now adds a soft-404 heuristic (not-found title/H1 + thin content) and is relabelled to "Sampled pages return OK"; still bounded to the sampled pages.
- **G7 (freshness):** now parses the date and scores by recency (was presence-only).
- **G6 (stats):** `m`/`k`/`x` unit over-match cut via a no-trailing-letter guard.
- **G19/G20:** filler-pronoun + TL;DR phrase lists extended to common Western-EU languages.

(Each is mirrored 1:1 in the n8n "Run checks" port, covered by `checks-improvements.test.ts` + `parity.test.ts`, and the audit workflow was re-deployed + smoke-tested live.)

### Still pending
- **S14:** also probe `/sitemap_index.xml` + `/wp-sitemap.xml` and require an XML-ish body.
- **S17 / broken LINKS:** a real internal-link HEAD-probe (today S17 only judges the sampled pages, not links outside them).
- **TB30-35:** fetch headers for the sampled subpages, not just root; finish value-aware scoring (TB33 `frame-ancestors *`).
- **Tracking:** a two-phase headless consent interaction (load -> reject -> diff) to turn T5/T6/T7/T12 from "configured" into "behaves correctly".
- **S10/G19/G20:** CJK-aware word counting (today's i18n covers Western-EU, not CJK).

Every check change is mirrored in the n8n "Run checks" port and guarded by `parity.test.ts`.
