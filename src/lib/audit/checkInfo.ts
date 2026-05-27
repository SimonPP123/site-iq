/**
 * Human-facing guidance for each check: why it matters + how to fix it, with a concrete example.
 * Keyed by check id so it attaches to any audit's action plan (no re-run needed). Written for a
 * non-technical site owner. Hyphens only, no dashes.
 *
 * looksFor: one plain-language line describing what the crawl actually examines.
 * whenNA:   one plain-language line explaining WHY this check is N/A when it is. Accurate per-check
 *           reason derived from the engine logic in checks.ts. Only present on checks that can
 *           return null (ratio === null).
 */
export type CheckInfo = {
  why: string;
  fix: string;
  example?: string;
  /** One line: what the crawl actually looks for. */
  looksFor?: string;
  /** One line: why this check reports N/A for this site. Only set on nullable checks. */
  whenNA?: string;
};

export const CHECK_INFO: Record<string, CheckInfo> = {
  // ---- SEO ----
  S1: {
    looksFor: "Whether each sampled page has a <title> tag between 15 and 60 characters long.",
    why: "Your title is the clickable headline in Google and the browser tab. Too long and Google truncates it; too short and you waste a ranking and click opportunity.",
    fix: "Give each page a unique 15-60 character title, with the main keyword first and the brand at the end.",
    example: '<title>Real-time Analytics for Teams | Acme</title>',
  },
  S2: {
    looksFor: "Whether each sampled page has a meta description tag between 70 and 160 characters.",
    why: "The meta description is the grey snippet under your title in search results. It does not rank you, but a compelling one wins more clicks.",
    fix: "Write a 70-160 character summary with a clear benefit and a reason to click.",
    example: '<meta name="description" content="Acme helps teams track metrics in real time and ship faster.">',
  },
  S3: {
    looksFor: "Whether each page has a <link rel=\"canonical\"> tag in its source.",
    why: "A canonical tag tells search engines which URL is the 'real' one, so duplicate variants (trailing slash, ?utm=, http vs https) do not split your ranking.",
    fix: "Add a self-referencing canonical link to every page's <head>.",
    example: '<link rel="canonical" href="https://example.com/page">',
  },
  S4: {
    looksFor: "Whether any sampled page has a noindex directive in its robots meta tag.",
    why: "A 'noindex' tag tells Google to drop the page from search entirely. On an important page this silently kills all its traffic.",
    fix: "Remove the noindex robots meta from any page you want found in search.",
    example: 'Delete: <meta name="robots" content="noindex">',
  },
  S5: {
    looksFor: "Whether each sampled page's rendered HTML contains at least one <h1> element.",
    why: "The H1 is the page's main heading. Search engines and screen readers use it to understand the page's primary topic.",
    fix: "Make sure each page has at least one clear <h1> describing its main subject.",
    example: '<h1>Pricing plans for every team</h1>',
  },
  S10: {
    looksFor: "Whether each sampled page has at least 300 words of visible text content.",
    why: "Thin pages (under ~300 words) give search engines and AI answer-engines little to work with, so they rarely rank or get cited.",
    fix: "Expand key pages with substantive, genuinely useful content that fully answers the visitor's question.",
  },
  S12: {
    looksFor: "Whether each page has og:title and og:image Open Graph meta tags.",
    why: "Open Graph tags control how your links look when shared on social and messaging apps. Without them, links render as bare, unappealing URLs.",
    fix: "Add og:title, og:description and og:image to your <head>.",
    example: '<meta property="og:title" content="..."> <meta property="og:image" content="https://.../card.png">',
  },
  S13: {
    looksFor: "The fraction of <img> elements that have an alt attribute (empty alt is allowed for decorative images).",
    why: "Alt text describes images to screen-reader users and to search engines (image SEO). Missing alt hurts accessibility and image discoverability.",
    fix: "Add descriptive alt text to meaningful images; use empty alt=\"\" for purely decorative ones.",
    example: '<img src="shoe.jpg" alt="Wool runner sneaker in natural grey">',
  },
  S14: {
    looksFor: "Whether /sitemap.xml returns a 200 response, or robots.txt declares a Sitemap: directive.",
    why: "An XML sitemap lists your URLs so search engines find and crawl them efficiently, which matters most for larger or newer sites.",
    fix: "Publish /sitemap.xml (most CMSs and frameworks generate one) and reference it in robots.txt.",
    example: 'Sitemap: https://example.com/sitemap.xml',
    whenNA: "The sitemap check requires a separate fetch of /sitemap.xml (outside the page crawl) - that fetch did not complete for this audit, so the check is excluded from the score.",
  },
  S15: {
    looksFor: "Whether the page titles across all sampled pages are distinct (no two pages share the same title).",
    why: "Duplicate page titles confuse search engines about which page to rank and waste the clickable headline. Each page should describe its own content.",
    fix: "Give every page a distinct, descriptive title. Templated titles should include a unique element (the product, article, or page name).",
    example: "<title>Pricing | Acme</title> vs <title>Features | Acme</title>",
  },
  S16: {
    looksFor: "Whether the meta descriptions across all sampled pages are distinct.",
    why: "Duplicate meta descriptions mean Google often rewrites your snippet, and you lose the chance to tailor the pitch per page.",
    fix: "Write a unique 70-160 character description per page summarizing that page specifically.",
  },
  S17: {
    looksFor: "Whether sampled pages return a successful HTTP status and do not look like soft-404 error pages.",
    why: "Pages that return 4xx/5xx errors waste crawl budget, break user journeys, and bleed link equity. A crawler reaching a broken URL is a real problem to fix.",
    fix: "Fix or redirect (301) broken URLs, and update the internal links that point to them.",
  },
  S18: {
    looksFor: "Whether each page has exactly one H1 and heading levels that do not skip (H1 -> H2 -> H3, never H2 -> H4).",
    why: "A clean heading outline (one H1, no skipped levels) helps search engines, AI engines and screen readers understand the page structure.",
    fix: "Use exactly one H1 for the page topic, then H2/H3 in order without skipping a level (no H2 jumping straight to H4).",
    example: "<h1>Guide</h1> <h2>Section</h2> <h3>Detail</h3>",
  },
  S21: {
    looksFor: "Whether pages with hreflang attributes use valid ISO language/region codes and include a self-referencing tag.",
    why: "hreflang tells search engines which language/region version of a page to show. Malformed or missing hreflang sends EU/multilingual visitors to the wrong version.",
    fix: "Use valid ISO codes (e.g. en, en-GB, de-DE, or x-default), include a self-referencing tag, and make sure every alternate links back.",
    example: '<link rel="alternate" hreflang="de-DE" href="https://example.com/de/">',
    whenNA: "No hreflang tags were found on any sampled page - this site appears to be single-language, so hreflang does not apply and you are not penalised.",
  },
  S23: {
    looksFor: "Whether each page's canonical tag points to that same page (not to a different URL).",
    why: "A canonical tag that points to a different URL tells Google to index that other page instead of this one, so this page silently drops out of search. It is a common, costly mistake when canonicals are templated wrong.",
    fix: "Make each page's canonical point to itself (the clean, preferred URL), unless you deliberately want it consolidated into another page.",
    example: 'On https://site.com/pricing use <link rel="canonical" href="https://site.com/pricing">',
  },

  // ---- Tracking & Analytics ----
  T1: {
    looksFor: "Whether GA4, Plausible, Fathom, Matomo or another analytics tag is present in the page source or rendered HTML.",
    why: "Without analytics you are flying blind: you cannot see traffic, conversions, or what is working.",
    fix: "Install GA4 (or a privacy-friendly tool like Plausible), directly or via Tag Manager. Note: tags loaded through GTM are not visible to this crawl, so verify in Google Tag Assistant.",
    example: 'gtag/js?id=G-XXXXXXXXXX',
    whenNA: "No tracking was detected on this site and no GTM container was found - so the crawl cannot assess analytics one way or the other. The whole Tracking dimension is excluded from the score rather than guessing.",
  },
  T2: {
    looksFor: "Whether any page contains a legacy Universal Analytics (UA-...) tag or the deprecated analytics.js loader.",
    why: "Universal Analytics (UA-...) stopped collecting data in 2023. If it is still on your site, it is dead weight.",
    fix: "Remove any legacy UA tags and confirm you are fully on GA4 (a G- measurement ID).",
    whenNA: "No tracking layer was detected on this site at all - so whether a legacy UA tag exists cannot be assessed. The Tracking dimension is excluded from the score.",
  },
  T3: {
    looksFor: "Whether a Google Tag Manager container (googletagmanager.com/gtm.js or a GTM-... id) is present in the page source.",
    why: "Google Tag Manager lets you manage analytics and marketing tags without code changes. It is the standard, clean way to deploy tracking.",
    fix: "Optional, but recommended if you run several tags: install the GTM container and move your tags into it.",
    whenNA: "GTM was not detected in the page source. GTM is optional infrastructure - its absence is not a fault - so this check does not score against you; it is shown as N/A rather than 'failed'.",
  },
  T5: {
    looksFor: "Whether Google Consent Mode signals (gtag 'consent' calls or ad_storage / analytics_storage) are present in the page source.",
    why: "Google Consent Mode adjusts tag behaviour based on user consent. It is required to run Google Ads and Analytics compliantly for EEA visitors.",
    fix: "Implement Consent Mode in your gtag/GTM setup (default denied, update on consent).",
    whenNA: "No tracking was detected and no GTM container was found - Consent Mode cannot be assessed from the crawl. The Tracking dimension is excluded from the score rather than penalising a site that may have everything configured via GTM.",
  },
  T6: {
    looksFor: "Whether the Consent Mode v2 signals ad_user_data and ad_personalization are both present in the page source.",
    why: "Consent Mode v2 (the ad_user_data and ad_personalization signals) has been mandatory since 2024 to keep Google Ads and remarketing working for EEA users.",
    fix: "Upgrade your consent setup to send the ad_user_data and ad_personalization signals.",
    whenNA: "No tracking was detected and no GTM container was found - Consent Mode v2 cannot be assessed from the crawl. The Tracking dimension is excluded from the score rather than penalising a site that may have everything configured via GTM.",
  },
  T7: {
    looksFor: "Whether a known CMP / cookie-consent library (Cookiebot, OneTrust, CookieYes, iubenda, Didomi, etc.) is present in the page source or rendered HTML.",
    why: "If you set non-essential cookies (analytics, ads) before consent, you likely breach GDPR/ePrivacy and risk fines.",
    fix: "Add a consent banner (Cookiebot, Usercentrics, iubenda, etc.) that blocks tags until the visitor consents. Note: a GTM-injected banner is not visible to this crawl.",
    whenNA: "Your consent/analytics setup may be injected by a tag manager (GTM) at runtime, which a static crawl cannot see - so we cannot confirm or deny the presence of a CMP banner, and you are not penalised. Verify in Google Tag Assistant or by inspecting the live site with JavaScript enabled.",
  },
  T8: {
    looksFor: "Whether ad or social pixels (Meta Pixel, LinkedIn Insight Tag, TikTok Pixel, Microsoft Advertising, etc.) are present in the page source or rendered HTML.",
    why: "Ad and social pixels (Meta, LinkedIn, TikTok) let you retarget visitors and measure ad ROI. Without them, paid campaigns cannot be optimized.",
    fix: "If you run paid ads, add the relevant pixel(s) for those channels, ideally via Tag Manager.",
    whenNA: "No tracking layer was detected on this site and no GTM container was found - ad pixels may be injected at runtime and invisible to a static crawl. The check is excluded rather than incorrectly flagging a gap.",
  },
  T12: {
    looksFor: "Whether a session-recording tool (Microsoft Clarity, Hotjar, FullStory, etc.) is present AND a CMP is also present to gate it.",
    why: "Session-recording / heatmap tools (Microsoft Clarity, Hotjar, FullStory) capture screen content and input, which is personal data - they require consent before they run in the EEA/UK.",
    fix: "Gate session-recording behind your consent banner (load it only after the visitor accepts), or remove it. We pass this only when a CMP is also present to gate it.",
    whenNA: "No tracking was detected on this site, or a session recorder is present but GTM is also present (which could be injecting the CMP at runtime, making it invisible to a crawl) - so the gating relationship cannot be assessed reliably.",
  },
  T15: {
    looksFor: "Whether window.dataLayer is initialized in the page source (as a global array or via a GTM-standard snippet).",
    why: "The dataLayer is the standard, ordered queue that Tag Manager and Consent Mode rely on. Initializing it early is the foundation of a correct, consent-aware tag setup.",
    fix: "Initialize window.dataLayer (and your Consent Mode default) before loading gtag.js / GTM.",
    example: "window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);}",
    whenNA: "No dataLayer initialization was found in the page source. dataLayer is optional infrastructure (not all sites use GTM) - its absence is shown as N/A rather than a fault.",
  },
  T20: {
    looksFor: "When both a gtag consent default call and a tag loader are inline in the HTML, whether the consent default appears before the loader.",
    why: "Google Consent Mode only protects EEA/UK visitors if the consent 'default' (deny) runs BEFORE your tags load. If the loader runs first, tags can fire before consent is applied - a GDPR/ePrivacy exposure.",
    fix: "Set gtag('consent','default',{...denied}) in the <head> BEFORE the gtag.js / GTM loader script.",
    example: "<script>gtag('consent','default',{ad_storage:'denied'})</script> ... then <script src=\".../gtm.js\">",
    whenNA: "Consent Mode is not configured inline in the HTML (it is likely managed inside GTM, which handles ordering internally) - so this ordering check does not apply.",
  },

  // ---- AI-Readiness / GEO ----
  G1: {
    looksFor: "Whether each page has at least one <script type=\"application/ld+json\"> block (any structured data at all).",
    why: "Structured data (Schema.org JSON-LD) tells search engines and AI exactly what your content is (product, article, FAQ), unlocking rich results and AI citations.",
    fix: "Add JSON-LD for each page type: Organization on the homepage, Product on product pages, Article with author and date on posts.",
    example: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization",...}</script>',
  },
  G3: {
    looksFor: "Whether the no-JavaScript initial HTML (a plain HTTP GET, no browser rendering) already contains most of the text visible after JavaScript runs.",
    why: "AI answer-engines (ChatGPT, Perplexity) and many crawlers do not run JavaScript. Content that only appears after JS renders is invisible to them.",
    fix: "Server-side render or pre-render your key content so it is present in the initial HTML response.",
    whenNA: "Comparing no-JS vs. rendered HTML requires a separate plain-GET fetch of the root page - that fetch was not available for this audit, so SSR cannot be assessed and the check is excluded from the score.",
  },
  G4: {
    looksFor: "Whether each page's markdown content opens with a substantive direct-answer sentence (60-400 chars, ends with punctuation) before the first heading.",
    why: "Pages that open with a direct, declarative answer are far more likely to be quoted by AI answer-engines.",
    fix: "Start key pages with one clear sentence that defines what the page or product is.",
    example: 'Acme is a real-time analytics platform for product teams.',
  },
  G5: {
    looksFor: "Whether each page contains FAQPage / Question structured data, or markdown headings that end with a question mark.",
    why: "A clear Q&A / FAQ structure matches how people phrase questions to AI, making your content easy to extract and cite.",
    fix: "Add an FAQ section answering real customer questions, ideally marked up with FAQPage schema.",
  },
  G6: {
    looksFor: "Whether each page's text contains at least 3 statistics, percentages, currency amounts, or numeric ratios.",
    why: "AI answer-engines preferentially cite content backed by concrete statistics and references.",
    fix: "Add specific numbers, data points and links to authoritative sources in your key content.",
  },
  G7: {
    looksFor: "Whether each page declares a dateModified or datePublished in its schema, or a <time datetime> element, and how recent that date is.",
    why: "Freshness signals tell search and AI your content is current. Stale-looking pages get cited less (AI engines have a strong recency bias).",
    fix: "Show a visible 'last updated' date and include datePublished/dateModified in your schema.",
  },
  G8: {
    looksFor: "Whether the page source contains author markup, rel=\"author\" links, Organization schema, or sameAs attributes.",
    why: "Authorship and organization signals (E-E-A-T) build the trust that search and AI use to decide whom to cite, especially for sensitive topics.",
    fix: "Add author bylines, an Organization schema with sameAs links to your profiles, and clear about/contact pages.",
  },
  G9: {
    looksFor: "Whether robots.txt blocks known AI crawlers such as GPTBot, ClaudeBot, PerplexityBot or Google-Extended.",
    why: "If your robots.txt blocks GPTBot, ClaudeBot or PerplexityBot, those AI engines literally cannot read or cite your site.",
    fix: "Allow the major AI crawlers in robots.txt, unless you deliberately want to exclude them.",
    example: 'Remove a "User-agent: GPTBot / Disallow: /" block',
    whenNA: "Checking whether AI crawlers are blocked requires fetching robots.txt - that fetch did not complete for this audit, so the check is excluded from the score.",
  },
  G11: {
    looksFor: "Whether each page has typed JSON-LD with meaningful properties - e.g. Organization with name, Article with author + datePublished, Product with offers, or FAQPage.",
    why: "AI engines and rich results need the RIGHT schema types with their key properties (an Organization with a name, an Article with author + date, a Product with offers) - not just any JSON-LD.",
    fix: "Add the JSON-LD type that matches each page: Organization on the homepage, Article (with author + datePublished) on posts, Product (with offers) on product pages, FAQPage where relevant.",
    example: '{"@context":"https://schema.org","@type":"Article","author":{"@type":"Person","name":"..."},"datePublished":"2026-01-01"}',
  },
  G12: {
    looksFor: "Whether any page has a nosnippet or max-snippet:0 robots directive, or the root response sends an X-Robots-Tag with nosnippet.",
    why: "AI Overviews and answer engines can only quote pages that are snippet-eligible. A nosnippet or max-snippet:0 directive silently blocks your content from being cited.",
    fix: "Remove nosnippet / max-snippet:0 from the robots meta (and data-nosnippet wrappers) on pages you want AI engines to cite.",
    example: 'Avoid: <meta name="robots" content="nosnippet">',
  },
  G14: {
    looksFor: "Whether each page's markdown contains at least 3 list items or 2 table rows, or the HTML contains a <table> element.",
    why: "Lists and tables are the formats AI answer engines lift verbatim. Well-structured content is far more likely to be extracted and cited.",
    fix: "Break key content into bulleted/numbered lists and comparison tables rather than dense paragraphs.",
  },
  G15: {
    looksFor: "Whether each page links out to at least one authoritative external source (.gov/.edu, Wikipedia, DOI, WHO, Reuters, etc.).",
    why: "Citing authoritative external sources is the single largest measured boost to AI citation likelihood (Princeton GEO study). It signals trustworthy, evidence-backed content.",
    fix: "Link out to authoritative primary sources (.gov/.edu, standards bodies, Wikipedia/Wikidata, DOIs) where you make factual claims.",
  },
  G16: {
    looksFor: "Whether /llms.txt returns a 200 response (an opt-in markdown index file for AI crawlers).",
    why: "llms.txt is an opt-in, AI-readable index of your most important pages. It is early and unproven (Google ignores it), but it is a cheap, forward-looking signal that you are thinking about AI discovery.",
    fix: "Publish /llms.txt - a short markdown file linking your key pages (docs, product, pricing) with one-line descriptions.",
    example: "# Acme\\n> Real-time analytics.\\n## Docs\\n- [Quickstart](https://acme.com/docs): set up in 5 minutes",
    whenNA: "Checking for /llms.txt requires a separate fetch - that fetch was not part of this audit, so the check is excluded from the score.",
  },
  G17: {
    looksFor: "Whether the brand name in og:site_name, Organization schema 'name', and page titles is consistent across sampled pages.",
    why: "AI engines only merge mentions of your brand into a single citable entity if the name is consistent. If your schema says 'Acme Inc', og:site_name says 'Acme' and the title says 'AcmeHQ', they may be treated as different entities.",
    fix: "Use one consistent brand name across your Organization schema 'name', og:site_name, and the brand part of your <title>.",
    whenNA: "No sampled page declared a brand name via og:site_name or Organization schema - consistency cannot be checked when there is nothing to compare, and the missing schema is already penalised by G1/G11.",
  },
  G18: {
    looksFor: "Whether the site's Organization JSON-LD has a sameAs array pointing to Wikipedia, Wikidata, or at least two official profile URLs.",
    why: "sameAs links connect your Organization schema to your authoritative profiles (Wikipedia, Wikidata, LinkedIn, X). They are the strongest signal an AI engine uses to disambiguate and trust your brand.",
    fix: "Add a sameAs array to your Organization JSON-LD listing your official profiles - a Wikipedia or Wikidata URL is the most valuable.",
    example: '"sameAs":["https://en.wikipedia.org/wiki/Acme","https://www.linkedin.com/company/acme"]',
  },
  G19: {
    looksFor: "The fraction of H2 sections (across all pages) that open with a direct-answer sentence of 30-130 words before any sub-heading or list.",
    why: "AI answer-engines lift self-contained answers from individual sections. Sections that open with a tight, direct answer (not 'It is...' or 'In this section...') are far more likely to be quoted.",
    fix: "Start each H2 section with a 1-2 sentence direct answer to that section's question, before the detail. Avoid opening with a pronoun or filler word.",
    example: "## How much does Acme cost?\\nAcme starts at $49/month for 5 seats, with a free 14-day trial...",
  },
  G20: {
    looksFor: "Whether each page's top 25% of content contains a TL;DR, Key Takeaways, or similar summary heading followed by a list.",
    why: "A TL;DR or Key Takeaways block near the top gives AI engines a pre-chunked, quotable summary of the whole page - one of the formats they cite most.",
    fix: "Add a short 'TL;DR' or 'Key takeaways' heading near the top of long pages, followed by 3-7 bullet points.",
    example: "## Key takeaways\\n- Acme cuts reporting time 40%\\n- Plans from $49/mo\\n- SOC 2 certified",
  },

  // ---- Tech Basics ----
  TB1: {
    looksFor: "Whether every sampled page URL starts with https://.",
    why: "HTTPS encrypts traffic and is a baseline trust and ranking signal. Browsers flag non-HTTPS sites as 'Not secure'.",
    fix: "Install a TLS certificate (free via Let's Encrypt or your host) and redirect all HTTP traffic to HTTPS.",
  },
  TB3: {
    looksFor: "Whether any HTTPS page loads sub-resources (images, scripts, stylesheets) over plain HTTP.",
    why: "Mixed content (HTTP resources on an HTTPS page) gets blocked by browsers, which breaks images or scripts and triggers security warnings.",
    fix: "Serve every image, script and stylesheet over HTTPS.",
  },
  TB4: {
    looksFor: "Whether each page has a <meta name=\"viewport\"> tag.",
    why: "Without a mobile viewport tag, your site renders zoomed-out and broken on phones, and Google indexes mobile-first.",
    fix: "Add the viewport meta to every page's <head>.",
    example: '<meta name="viewport" content="width=device-width, initial-scale=1">',
  },
  TB5: {
    looksFor: "Whether robots.txt's wildcard (*) user-agent group contains a Disallow: / rule that blocks all crawlers.",
    why: "A robots.txt that disallows everything hides your entire site from search engines. It is a catastrophic, easy-to-make mistake.",
    fix: "Make sure robots.txt does not block the whole site for search crawlers.",
    example: 'Avoid: "User-agent: * / Disallow: /"',
    whenNA: "Checking robots.txt requires fetching it - that fetch did not complete for this audit, so the check is excluded from the score.",
  },
  TB6: {
    looksFor: "The fraction of <img> elements that declare both width and height attributes (or an aspect-ratio style) to prevent layout shift.",
    why: "Slow pages (images without dimensions, no lazy-loading, render-blocking scripts) hurt Core Web Vitals, rankings and conversions.",
    fix: "Add width/height to images, lazy-load below-the-fold media, and defer non-critical scripts. (This is a static proxy; for real field data use PageSpeed Insights.)",
    example: '<img src="..." width="800" height="600" loading="lazy">',
  },
  TB10: {
    looksFor: "Whether each page declares a charset meta tag and a lang attribute on the <html> element.",
    why: "Declaring charset and language helps browsers render text correctly and helps search engines and screen readers serve the right audience.",
    fix: "Add a charset meta and a lang attribute on the <html> tag.",
    example: '<meta charset="utf-8"> ... <html lang="en">',
  },
  TB12: {
    looksFor: "Whether each page's <head> contains a <link rel=\"icon\"> or similar favicon declaration.",
    why: "A favicon is a small but real brand and trust signal, shown in browser tabs, bookmarks and some search results.",
    fix: "Add a favicon link (and ideally an apple-touch-icon) to your <head>.",
    example: '<link rel="icon" href="/favicon.ico">',
  },
  TB19: {
    looksFor: "The fraction of <img> elements that use WebP/AVIF format (or a <picture> element), and how many use loading=\"lazy\".",
    why: "Next-gen image formats (WebP/AVIF) and lazy-loading below-the-fold images cut page weight and improve loading (LCP), especially on mobile.",
    fix: "Serve images as WebP/AVIF (or via <picture>), and add loading=\"lazy\" to below-the-fold images.",
    example: '<img src="hero.avif" loading="lazy" width="800" height="600">',
  },
  TB20: {
    looksFor: "Whether every <script src> tag inside <head> uses async, defer, or type=\"module\" (non-blocking).",
    why: "Synchronous scripts in the <head> (no async/defer) block the browser from rendering, delaying first paint and LCP.",
    fix: "Add async or defer to <head> scripts, use type=\"module\", or move non-critical scripts to the end of <body>.",
    example: '<script src="/app.js" defer></script>',
    whenNA: "The <head> section could not be reliably isolated from the raw HTML on any sampled page - the render-blocking script check requires the raw source head, so it is excluded from the score.",
  },
  TB22: {
    looksFor: "Whether each page's raw HTML starts with <!doctype html> as the very first content.",
    why: "A missing or malformed doctype throws browsers into legacy 'quirks mode', which can break layout and box-model calculations.",
    fix: "Start every HTML document with the HTML5 doctype as the very first line.",
    example: "<!doctype html>",
  },

  // ---- Tech Basics: security headers ----
  TB30: {
    looksFor: "Whether the root URL's HTTP response includes a Strict-Transport-Security header with max-age >= 1 year.",
    why: "HSTS forces browsers to always use HTTPS for your site, closing a window where a visitor's first request could be downgraded to insecure HTTP and intercepted.",
    fix: "Send a Strict-Transport-Security response header from your server or CDN (start with a short max-age, then raise it once you are confident).",
    example: "Strict-Transport-Security: max-age=31536000; includeSubDomains",
    whenNA: "Security headers are read from the root URL's HTTP response - that response was not available for this audit (the headers fetch did not complete), so this check is excluded from the score.",
  },
  TB31: {
    looksFor: "Whether the root URL's HTTP response includes a Content-Security-Policy header (and whether it avoids unsafe-inline/unsafe-eval).",
    why: "A Content-Security-Policy is the strongest defence against cross-site scripting (XSS) and content injection - it tells the browser which sources of script, style and media to trust.",
    fix: "Add a Content-Security-Policy header. Start in report-only mode to find what your pages load, then enforce a tightened policy.",
    example: "Content-Security-Policy: default-src 'self'; script-src 'self'",
    whenNA: "Security headers are read from the root URL's HTTP response - that response was not available for this audit (the headers fetch did not complete), so this check is excluded from the score.",
  },
  TB32: {
    looksFor: "Whether the root URL's HTTP response includes X-Content-Type-Options: nosniff.",
    why: "Without X-Content-Type-Options: nosniff, browsers may 'sniff' a file's type and execute, say, an uploaded image as a script - a classic injection vector.",
    fix: "Send the X-Content-Type-Options: nosniff response header on all responses (usually one line in your server or CDN config).",
    example: "X-Content-Type-Options: nosniff",
    whenNA: "Security headers are read from the root URL's HTTP response - that response was not available for this audit (the headers fetch did not complete), so this check is excluded from the score.",
  },
  TB33: {
    looksFor: "Whether the root URL's HTTP response includes X-Frame-Options or a Content-Security-Policy frame-ancestors directive.",
    why: "Without clickjacking protection, an attacker can load your site invisibly inside their own page and trick users into clicking things (e.g. confirming a payment) on your behalf.",
    fix: "Send X-Frame-Options: DENY (or SAMEORIGIN), or better, a Content-Security-Policy with a frame-ancestors directive.",
    example: "Content-Security-Policy: frame-ancestors 'self'   (or  X-Frame-Options: SAMEORIGIN)",
    whenNA: "Security headers are read from the root URL's HTTP response - that response was not available for this audit (the headers fetch did not complete), so this check is excluded from the score.",
  },
  TB34: {
    looksFor: "Whether the root URL's HTTP response includes a Referrer-Policy header.",
    why: "A Referrer-Policy controls how much of your URL is leaked to other sites visitors click through to - without one, full URLs (sometimes with sensitive parameters) can leak.",
    fix: "Send a Referrer-Policy header; strict-origin-when-cross-origin is a sensible privacy-preserving default.",
    example: "Referrer-Policy: strict-origin-when-cross-origin",
    whenNA: "Security headers are read from the root URL's HTTP response - that response was not available for this audit (the headers fetch did not complete), so this check is excluded from the score.",
  },
  TB35: {
    looksFor: "Whether the root URL's HTTP response includes a Permissions-Policy (or Feature-Policy) header.",
    why: "A Permissions-Policy lets you switch off powerful browser features (camera, microphone, geolocation) your site does not use, shrinking the attack surface if a script is ever compromised.",
    fix: "Send a Permissions-Policy header that disables the features you do not need.",
    example: "Permissions-Policy: geolocation=(), camera=(), microphone=()",
    whenNA: "Security headers are read from the root URL's HTTP response - that response was not available for this audit (the headers fetch did not complete), so this check is excluded from the score.",
  },
};
