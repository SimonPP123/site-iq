/**
 * Site IQ deterministic checks - the typed, tested source of truth.
 *
 * The n8n "Run checks" Code node is a 1:1 JavaScript port of these functions (see
 * n8n-workflows/build_audit_workflow.py and WALKTHROUGH.md). Keeping the logic here in
 * strict TypeScript lets us unit-test every check; the workflow mirrors it verbatim.
 *
 * Each check returns a 0..1 ratio over the crawled sample (1 pass, 0 fail, 0..1 coverage),
 * which scoring.ts turns into dimension and overall scores.
 *
 * Detection note: tag/script presence is matched against `src` = rawHtml + rendered html,
 * so both hard-coded and GTM-injected tags are seen. Count-based checks (one H1) use rendered html.
 */

import type {
  AuditedPage,
  CheckEvidence,
  CheckResult,
  CrawledPage,
  FailingPage,
  FailureReason,
} from "./types";

/**
 * Output of `runChecks`. The check list + per-page rollups computed from the FULL (pre-truncation)
 * data: `pages` lists every successfully-crawled URL's normalized path, `pagesWithIssues` counts
 * unique paths that failed >=1 check. Computed here (not later in scoreAudit) because mkEvidence
 * truncates failing[] to EVID_CAP=12 with the overflow in `more` - a future MAX_PAGES bump would
 * make union-of-truncated-failing arrays silently undercount. See Phase 2B plan + red-line #3.
 */
export interface RunChecksOutput {
  checks: CheckResult[];
  pages: AuditedPage[];
  pagesWithIssues: number;
}

const rawHtml = (p: CrawledPage) => p.rawHtml ?? "";
const html = (p: CrawledPage) => p.html ?? p.rawHtml ?? "";
const src = (p: CrawledPage) => `${p.rawHtml ?? ""}\n${p.html ?? ""}`;
const md = (p: CrawledPage) => p.markdown ?? "";
const meta = (p: CrawledPage) => p.metadata ?? {};
const text = (p: CrawledPage) =>
  (p.markdown ?? html(p).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Cross-page uniqueness: fraction of NON-EMPTY values that occur exactly once. Returns null (N/A)
 *  when there are fewer than 2 non-empty values - uniqueness is not assessable, and crucially an
 *  all-EMPTY input (a site with no titles / no meta descriptions) must NOT score a false 1.0 "all
 *  unique" PASS. The ABSENCE is already penalized by S1 (title) / S2 (description); routing S15/S16
 *  through the nullable cn() so they renormalize out avoids a self-contradictory green "unique meta:
 *  passed on every page" next to a red "meta description: failed" for the same missing tags. */
const uniqRatio = (vals: string[]): number | null => {
  const v = vals.map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (v.length < 2) return null;
  const counts: Record<string, number> = {};
  for (const x of v) counts[x] = (counts[x] ?? 0) + 1;
  return v.filter((x) => counts[x] === 1).length / v.length;
};

/** Host of a URL via regex (the n8n Code sandbox has no WHATWG URL global, so mirror that here). */
const hostOf = (u: string): string =>
  (u.match(/^https?:\/\/([^/?#]+)/i)?.[1] ?? "").replace(/^www\./, "").toLowerCase();

/** Compact path of a URL for per-page evidence: "/about" (query/hash dropped, trailing slash trimmed),
 *  "/" for the root, or the raw input when it is not an absolute URL. Regex-only (no URL global).
 *  Control chars stripped + capped at 200 bytes so a pathological URL (4KB path, NULL byte from a
 *  broken server) cannot bloat the jsonb or smuggle non-printable chars into the report. */
const PATH_MAX = 200;
const pathOf = (u: string): string => {
  const m = u.match(/^https?:\/\/[^/]+(\/[^?#]*)?/i);
  const scrub = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, "");
  if (!m) return scrub(u || "/").slice(0, PATH_MAX) || "/";
  const p = scrub((m[1] ?? "/").replace(/\/+$/, ""));
  return (p === "" ? "/" : p).slice(0, PATH_MAX);
};

/**
 * Auxiliary inputs fetched once per audit (not per page): the site's robots.txt and whether a
 * sitemap is reachable. Optional - when omitted (e.g. in unit tests) the robots/sitemap checks
 * report N/A and are renormalized out, so they never penalize.
 */
export type AuditAux = {
  robotsFetched?: boolean; // did we attempt GET /robots.txt? (false/undefined = not fetched -> N/A)
  robotsTxt?: string; // body if fetched (empty string when 404 = "no robots = allow all")
  sitemapFound?: boolean; // /sitemap.xml returned 200, or robots.txt declares a Sitemap:
  headersFetched?: boolean; // did the root URL return an HTTP response? (false/undefined -> security-header checks N/A)
  headers?: Record<string, string>; // root URL response headers, keys lowercased (security-header checks)
  llmsTxtFound?: boolean; // /llms.txt returned 200 (the opt-in AI-index file); undefined = not fetched -> N/A
  rootHtml?: string; // the NO-JS initial HTML of the root URL (a plain GET, no browser render) - lets G3
  // distinguish real server-side rendering from a client-rendered shell. undefined = not fetched -> G3 N/A.
  /**
   * Parsed public GTM container (`gtm.js?id=GTM-...`) - the tags it is configured to fire, read directly
   * from the container source. This is ground truth for analytics/consent that a page gates behind cookie
   * consent (and is therefore invisible to a plain crawl). null/undefined = no GTM found or not fetched.
   */
  gtm?: {
    ga4: string[]; // GA4 measurement ids (G-...) configured in the container
    adwords: string[]; // Google Ads conversion ids (AW-...)
    ua: boolean; // a legacy Universal Analytics id (UA-...) is configured
    consent: boolean; // Consent Mode signals present (analytics_storage / ad_storage)
    consentV2: boolean; // Consent Mode v2 (ad_user_data + ad_personalization)
    pixels: boolean; // a known ad/social pixel is configured in the container
  } | null;
  /**
   * Grounded-semantic rescue verdicts (Phase 3), keyed by check id (G4/G6/G8/G19). An LLM judged the
   * page content and the n8n "Verify semantic" node confirmed its quoted evidence exists on the page,
   * so each value is a trustworthy 0..1 ratio (or null = could not assess -> the deterministic heuristic
   * stands). Absent in unit tests, so the heuristics are exercised unchanged.
   */
  semantic?: Record<string, number | null>;
};

/** A robots.txt blocks the whole site if the `*` user-agent group disallows `/`. */
function robotsBlocksWholeSite(robotsTxt: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
  let inStar = false;
  for (const line of lines) {
    const ua = /^user-agent:\s*(.+)$/i.exec(line);
    if (ua) { inStar = ua[1].trim() === "*"; continue; }
    if (inStar && /^disallow:\s*\/\s*$/i.test(line)) return true;
  }
  return false;
}

/** Does robots.txt disallow a major AI answer-engine crawler? (such a site can't be cited by it). */
function robotsBlocksAiCrawler(robotsTxt: string): boolean {
  // 2026 AI crawlers: training bots AND the retrieval/search bots that drive live citations.
  const bots = ["gptbot", "oai-searchbot", "chatgpt-user", "claudebot", "claude-searchbot", "claude-web",
    "anthropic-ai", "perplexitybot", "perplexity-user", "google-extended", "ccbot", "applebot-extended",
    "amazonbot", "meta-externalagent", "bytespider"];
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
  let blockedAgent = false;
  for (const line of lines) {
    const ua = /^user-agent:\s*(.+)$/i.exec(line);
    if (ua) { blockedAgent = bots.includes(ua[1].trim().toLowerCase()); continue; }
    if (blockedAgent && /^disallow:\s*\/\s*$/i.test(line)) return true;
  }
  return false;
}

/** Run the full deterministic audit over a crawled sample. Returns the check list + per-page rollups
 *  (`pages`, `pagesWithIssues`) that the report UI uses to show which URLs were audited. The legacy
 *  `runChecks` re-export (below) returns only the check list, so existing call sites + tests stay
 *  unchanged. New consumers (n8n mirror, contract.ts, sample/page.tsx) should use `runAudit`. */
export function runAudit(pages: CrawledPage[], rootUrl = "", aux: AuditAux = {}): RunChecksOutput {
  const sample = pages.filter(
    (p) => p && (p.html || p.rawHtml || p.markdown || p.metadata),
  );
  const n = sample.length || 1;
  // Per-page rollups, computed from the FULL pre-truncation data. `sampledPaths` are the unique
  // normalized paths of every successfully-crawled page (the report's "pages we audited" list).
  // `pagesWithIssuesSet` is populated inside covR/cov so it captures every failing page across every
  // check - NEVER derive this from the per-check `failing[]` arrays, which mkEvidence truncates to
  // EVID_CAP=12 with the overflow in `more` (a future MAX_PAGES bump would otherwise undercount).
  const sampledPaths = new Set<string>();
  for (const p of sample) sampledPaths.add(pathOf(meta(p).sourceURL ?? rootUrl));
  const auditedPages: AuditedPage[] = [...sampledPaths].sort().map((path) => ({ path }));
  const pagesWithIssuesSet = new Set<string>();
  // Per-page coverage. The diagnostic returns `null` to mean "this page passes the check" or a
  // structured `FailureReason` to mean "this page failed, here is why" - so the same pass over the
  // sample populates both the ratio (pass/n) and the per-URL failure list with reasons. The ratio
  // semantics are identical to the previous boolean `cov`, so scores and parity stay unchanged; the
  // failing-page list with reasons is the new evidence the UI renders. Checks that pass a raw number
  // (partials, aux, tracking) instead get a "where" label in the post-pass at the end of this function.
  type CovEval = { r: number; failing: FailingPage[] };
  const EVID_CAP = 12; // max failing pages listed per check; overflow counted in evidence.more
  const REASON_MAX = 200; // hard cap on the byte size of any `other` note (XSS / jsonb-size guard)
  const sanitizeReason = (reason: FailureReason): FailureReason => {
    // Strip any control chars and length-cap free-text fields. Structured kinds are typed and safe
    // at the type level, so only the `other.note` and `mismatch`/`missing`/`wrong_count` string
    // fields need defensive scrubbing (they MAY come from user-controlled page content downstream).
    const scrub = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, "").slice(0, REASON_MAX);
    switch (reason.kind) {
      case "other":      return { kind: "other", note: scrub(reason.note) };
      case "missing":    return { kind: "missing", what: scrub(reason.what) };
      case "wrong_count": return { kind: "wrong_count", what: scrub(reason.what), actual: reason.actual, expected: reason.expected };
      case "mismatch":   return { kind: "mismatch", what: scrub(reason.what), expected: scrub(reason.expected), actual: scrub(reason.actual) };
      default:           return reason; // numeric / no-payload kinds need no scrubbing
    }
  };
  /**
   * Coverage with reasons. `diag(p)` returns `null` for pass, or a structured `FailureReason` for
   * fail. Wrapped in try/catch so a single broken page (e.g. malformed Firecrawl payload, exotic
   * encoding) never aborts the whole audit; a thrown diagnostic is treated as PASS (fail-open) with
   * a console.error - same posture as the previous boolean cov, which also could not throw because
   * the boolean tests are defensive. Always prefer this helper over the legacy `cov()`.
   */
  const covR = (diag: (p: CrawledPage) => FailureReason | null): CovEval => {
    const failing: FailingPage[] = [];
    let pass = 0;
    for (const p of sample) {
      const path = pathOf(meta(p).sourceURL ?? rootUrl);
      let reason: FailureReason | null = null;
      try {
        reason = diag(p);
      } catch (err) {
        // Fail-open: a diagnostic that throws is a bug in the rule OR a corrupt page, NOT a check
        // failure. Counting it as pass keeps a single broken page from tanking a real signal.
        // Surface it for debugging.
        // eslint-disable-next-line no-console
        console.error("[covR] diagnostic threw for", path, err);
        pass++;
        continue;
      }
      if (reason === null) pass++;
      else {
        const fp: FailingPage = { path, reason: sanitizeReason(reason) };
        failing.push(fp);
        pagesWithIssuesSet.add(path); // accumulated BEFORE mkEvidence's EVID_CAP truncation
      }
    }
    return { r: clamp01(pass / n), failing };
  };
  /** Legacy boolean coverage. Returns failing pages with `reason: undefined` - kept so the few
   *  remaining boolean checks compile without churn. New checks SHOULD use `covR`. */
  const cov = (fn: (p: CrawledPage) => boolean): CovEval => {
    const failing: FailingPage[] = [];
    let pass = 0;
    for (const p of sample) {
      if (fn(p)) pass++;
      else {
        const path = pathOf(meta(p).sourceURL ?? rootUrl);
        failing.push({ path });
        pagesWithIssuesSet.add(path); // accumulated BEFORE mkEvidence's EVID_CAP truncation
      }
    }
    return { r: clamp01(pass / n), failing };
  };
  const mkEvidence = (failing: FailingPage[], checked: number): CheckEvidence => {
    // De-dupe by path: two sampled URLs can normalize to the same path (e.g. "/a" and "/a/"), and
    // pages missing a sourceURL all collapse to the root - so the displayed list must be unique by
    // path. When two entries share a path but disagree on reason, FIRST one wins (deterministic +
    // matches the existing dedupe order; documented contract).
    const seen = new Set<string>();
    const uniq: FailingPage[] = [];
    for (const fp of failing) {
      if (!seen.has(fp.path)) { seen.add(fp.path); uniq.push(fp); }
    }
    const ev: CheckEvidence = {
      where: `Across all ${checked} crawled page${checked === 1 ? "" : "s"}`,
      checked,
    };
    if (uniq.length) ev.failing = uniq.slice(0, EVID_CAP);
    if (uniq.length > EVID_CAP) ev.more = uniq.length - EVID_CAP;
    return ev;
  };
  // --- Tracking detection (computed once). A static / render-limited crawl usually CANNOT see a
  // modern site's analytics & consent (GTM-injected, bot-gated, loaded late), so we score tracking
  // by CONFIDENCE and never guess:
  //  - a signal we positively detect -> pass (1);
  //  - a runtime-injectable signal we don't see, but we saw NO tracking at all OR GTM is present
  //    (it may live in the container) -> N/A (null): never lowers the score, the report says
  //    "verify in Tag Assistant"; if the WHOLE dimension is N/A it is excluded from the overall;
  //  - a signal we don't see on a site whose tracking IS partly visible inline -> a real gap (0).
  const det = {
    ga4: sample.some((p) => /[?&]id=G-[A-Z0-9]{10}\b|gtag\(\s*['"]config['"]\s*,\s*['"]G-[A-Z0-9]{10}|googletagmanager\.com\/gtag|plausible\.io\/js|cdn\.usefathom\.com|\bmatomo\.(?:js|php)\b|_paq\.push|static\.cloudflareinsights\.com|adobedtm\.com|\.omtrdc\.net|AppMeasurement|cdn\.segment\.com|cdn\.heapanalytics\.com|\.amplitude\.com|mixpanel\.com|cdn\.mxpanel|simpleanalyticscdn\.com|umami\.is|pirsch\.io/i.test(src(p))),
    // Catches the standard googletagmanager.com loader AND first-party / server-side GTM (sGTM), where the
    // container is served from the site's own domain and only the `?id=GTM-XXXX` query (a first-party gtm.js
    // or the noscript ns.html iframe) reveals it. Without the second alternative an sGTM site (e.g. a Framer
    // site tagging via data.<domain>) reads as "no GTM", which wrongly hard-zeroes the consent/CMP check
    // instead of marking it N/A - the CMP is GTM-injected and invisible to a crawl. `GTM-` is GTM-specific.
    gtm: sample.some((p) => /googletagmanager\.com\/gtm\.js|[?&\/]id=GTM-[A-Z0-9]+/i.test(src(p))),
    consent: sample.some((p) => /gtag\(\s*['"]consent['"]/i.test(src(p))),
    consentV2: sample.some((p) => /ad_user_data/i.test(src(p)) && /ad_personalization/i.test(src(p))),
    cmp: sample.some((p) => /cookiebot|onetrust|cookielaw\.org|usercentrics|cookieyes|iubenda|didomi|termly|trustarc|complianz|axeptio|klaro|cookiefirst|consentmanager\.net|quantcast|sourcepoint|osano|tarteaucitron|__tcfapi|cookie-law-info|cookielawinfo|borlabs-cookie|moove_gdpr|cmplz|real-cookie-banner|cookie-notice|cookieconsent|cookie-consent|data-cookieconsent|cky-consent|gdpr-cookie-consent/i.test(src(p))),
    pixels: sample.some((p) => /fbevents\.js|connect\.facebook\.net|snap\.licdn\.com|_linkedin_partner_id|analytics\.tiktok\.com|bat\.bing\.com|s\.pinimg\.com\/ct|pintrk\(|redditstatic\.com|\brdt\(|static\.ads-twitter\.com|\btwq\(|sc-static\.net|snaptr\(|q\.quora\.com|criteo\.(?:com|net)|amazon-adsystem\.com|cdn\.taboola\.com|outbrain\.com/i.test(src(p))),
    dataLayer: sample.some((p) => /dataLayer\.push\(|dataLayer\s*=\s*(?:\[|window\.dataLayer)/i.test(src(p))),
    ua: sample.some((p) => /\bUA-\d{4,}-\d+|google-analytics\.com\/analytics\.js|\bga\(\s*['"]create['"]/i.test(src(p))),
    recorder: sample.some((p) => /clarity\.ms|static\.hotjar\.com|_hjSettings|window\.clarity|mouseflow|fullstory\.com|crazyegg|posthog|logrocket|smartlook|inspectlet|luckyorange|contentsquare|glassbox|visualwebsiteoptimizer|quantummetric|sessioncam/i.test(src(p))),
  };
  // GTM container ground truth: if we fetched + parsed the site's public gtm.js container, it lists the
  // tags it actually fires (GA4, Ads, consent signals) WITHOUT needing the page to load them or consent to
  // be granted. This converts consent-gated, normally-invisible analytics/consent into VERIFIED.
  const gtm = aux.gtm ?? null;
  if (gtm) {
    det.ga4 = det.ga4 || gtm.ga4.length > 0 || gtm.adwords.length > 0;
    det.ua = det.ua || gtm.ua;
    det.consent = det.consent || gtm.consent;
    det.consentV2 = det.consentV2 || gtm.consentV2;
    det.pixels = det.pixels || gtm.pixels;
  }
  const anyTracking =
    det.ga4 || det.gtm || det.consent || det.consentV2 || det.cmp || det.pixels || det.dataLayer || det.ua;
  // Two confidence helpers. tCfg: analytics + Consent Mode ARE knowable from the GTM container, so when we
  // have it (verifiedConfig) a missing signal is a REAL gap (0), not N/A; without it we fall back to
  // confidence. tNA: the CMP banner + ad pixels are NOT (fully) in the container, so they stay confidence-
  // based and are never forced to 0 by container ground truth.
  const verifiedConfig = !!gtm;
  const tCfg = (detected: boolean): number | null =>
    detected ? 1 : verifiedConfig ? 0 : !anyTracking || det.gtm ? null : 0;
  const tNA = (detected: boolean): number | null => (detected ? 1 : !anyTracking || det.gtm ? null : 0);

  const c = (
    id: string,
    label: string,
    dimension: CheckResult["dimension"],
    weight: number,
    severity: CheckResult["severity"],
    ratio: number | CovEval,
    effort: number,
  ): CheckResult => {
    const res: CheckResult = {
      id, label, dimension, weight, severity,
      ratio: clamp01(typeof ratio === "number" ? ratio : ratio.r),
      effort,
    };
    if (typeof ratio !== "number") res.evidence = mkEvidence(ratio.failing, n);
    return res;
  };

  // Nullable variant: ratio === null means N/A (renormalized out by scoring) - used for the
  // robots/sitemap checks when their aux input wasn't fetched.
  const cn = (
    id: string, label: string, dimension: CheckResult["dimension"], weight: number,
    severity: CheckResult["severity"], ratio: number | CovEval | null, effort: number,
  ): CheckResult => {
    const isObj = ratio !== null && typeof ratio === "object";
    const r = ratio === null ? null : isObj ? (ratio as CovEval).r : (ratio as number);
    const res: CheckResult = {
      id, label, dimension, weight, severity,
      ratio: r === null ? null : clamp01(r),
      effort,
    };
    if (isObj) res.evidence = mkEvidence((ratio as CovEval).failing, n);
    return res;
  };

  // Root-URL response headers (lowercased keys), for the security-header checks. hdr() returns "" when
  // absent so regex tests are safe; has() is presence. Empty when headers weren't fetched -> those checks N/A.
  const hdr = (name: string): string => aux.headers?.[name.toLowerCase()] ?? "";
  const has = (name: string): boolean => hdr(name).trim().length > 0;

  // Grounded-semantic rescue (Phase 3): the n8n "Verify semantic" node may supply LLM verdicts for the
  // few genuinely-semantic GEO checks (G4/G6/G8/G19), each already confirmed to quote real on-page
  // evidence. The loop after the array overrides those checks' heuristic ratio with the verified verdict
  // - but ONLY when it's a real number, so a missing/failed/unverified LLM call leaves the deterministic
  // score untouched (fail-open). Unit tests pass no aux.semantic, so they exercise the heuristics.
  const sem: Record<string, number | null> = aux.semantic ?? {};
  const SEMANTIC_IDS = new Set(["G4", "G6", "G8", "G19"]);

  const out: CheckResult[] = [
    // SEO
    c("S1", "Title present (15-60 chars)", "seo", 10, "high",
      covR((p) => {
        const t = (meta(p).title ?? "").trim();
        if (t.length === 0) return { kind: "missing", what: "title" };
        if (t.length < 15)  return { kind: "too_short", actual: t.length, min: 15 };
        if (t.length > 60)  return { kind: "too_long",  actual: t.length, max: 60 };
        return null;
      }), 1),
    c("S2", "Meta description (70-160 chars)", "seo", 7, "medium",
      covR((p) => {
        const d = (meta(p).description ?? "").trim();
        if (d.length === 0) return { kind: "missing", what: "meta description" };
        if (d.length < 70)  return { kind: "too_short", actual: d.length, min: 70 };
        if (d.length > 160) return { kind: "too_long",  actual: d.length, max: 160 };
        return null;
      }), 1),
    c("S3", "Canonical tag present", "seo", 8, "high",
      covR((p) => /<link[^>]+rel=["']canonical["']/i.test(src(p)) ? null : { kind: "missing", what: "canonical link tag" }), 2),
    c("S4", "Indexable (no noindex)", "seo", 12, "critical",
      // Matches name="robots" OR name="googlebot", in either attribute order (name-then-content or
      // content-then-name). NOTE: an X-Robots-Tag HTTP-header noindex is not visible to the scrape.
      covR((p) => /<meta[^>]+(?:name=["'](?:robots|googlebot)["'][^>]*content=["'][^"']*noindex|content=["'][^"']*noindex[^>]*name=["'](?:robots|googlebot)["'])/i.test(src(p)) ? { kind: "noindex" } : null), 1),
    c("S5", "At least one H1", "seo", 7, "medium",
      covR((p) => (html(p).match(/<h1[\s>]/gi) ?? []).length >= 1 ? null : { kind: "missing", what: "h1 heading" }), 2),
    c("S10", "Content depth (>=300 words)", "seo", 7, "medium",
      covR((p) => { const w = words(text(p)); return w >= 300 ? null : { kind: "too_short", actual: w, min: 300 }; }), 4),
    c("S12", "Open Graph tags", "seo", 4, "low",
      covR((p) => /property=["']og:(?:title|image)["']/i.test(src(p)) ? null : { kind: "missing", what: "og:title and og:image" }), 1),
    c("S13", "Image alt coverage", "seo", 3, "low",
      clamp01(sample.reduce((s, p) => {
        const imgs = (html(p).match(/<img[\s>]/gi) ?? []).length;
        const withAlt = (html(p).match(/<img[^>]+\balt=/gi) ?? []).length;
        return s + (imgs ? withAlt / imgs : 1);
      }, 0) / n), 2),
    cn("S14", "XML sitemap present", "seo", 5, "medium",
      aux.sitemapFound === undefined ? null : aux.sitemapFound ? 1 : 0, 2),
    cn("S15", "Unique page titles", "seo", 8, "high",
      uniqRatio(sample.map((p) => meta(p).title ?? "")), 2),
    cn("S16", "Unique meta descriptions", "seo", 5, "medium",
      uniqRatio(sample.map((p) => meta(p).description ?? "")), 2),
    cn("S17", "Sampled pages return OK (no 4xx/5xx or soft-404)", "seo", 9, "high",
      // A sampled page is "broken" if it returned a 4xx/5xx status OR it returned 200 but is a soft-404
      // (a "not found" title/H1 on a thin page); covR records the broken pages WITH the structured
      // reason. NOTE: this judges only the <=10 sampled pages - Firecrawl drops genuinely-failed URLs
      // from the batch, so it cannot discover broken internal LINKS (an internal-link HEAD-probe is
      // the roadmap item).
      covR((p) => {
        const code = meta(p).statusCode;
        if (code !== undefined && (code < 200 || code >= 400)) return { kind: "http_status", code };
        const title = (meta(p).title ?? "").toLowerCase();
        const h1 = (html(p).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").replace(/<[^>]+>/g, " ").toLowerCase();
        const nf = /\b(?:404|not found|page not found|page (?:does ?n'?t|cannot be) found|no longer (?:exists|available))\b/;
        // Real soft-404: the not-found phrase appears AND the page is near-empty (Firecrawl's
        // main-content extraction strips nav/footer, so a genuine stub yields very few words).
        // Threshold lowered 150 -> 50 so a legitimate thin ARTICLE whose TOPIC is errors (e.g. a
        // 120-word "How to fix a 404" help note) is not mislabeled as a broken page.
        if ((nf.test(title) || nf.test(h1)) && words(text(p)) < 50) return { kind: "soft_404" };
        return null;
      }), 1),
    c("S18", "Logical heading hierarchy", "seo", 6, "medium",
      covR((p) => {
        const levels = (html(p).match(/<h([1-6])[\s>]/gi) ?? []).map((t) => Number(t.replace(/\D/g, "")));
        if (levels.length === 0) return { kind: "missing", what: "heading tags" };
        const h1Count = levels.filter((l) => l === 1).length;
        if (h1Count !== 1) return { kind: "wrong_count", what: "h1 heading", actual: h1Count, expected: 1 };
        let prev = 0;
        for (const l of levels) {
          if (prev && l > prev + 1) return { kind: "other", note: `heading level h${prev} jumps to h${l} (skipped h${prev + 1})` };
          prev = l;
        }
        return null;
      }), 3),
    cn("S21", "Valid hreflang (multilingual sites)", "seo", 6, "medium",
      sample.some((p) => /rel=["']alternate["'][^>]*hreflang=/i.test(src(p)))
        ? covR((p) => {
            const tags = src(p).match(/hreflang=["']([^"']+)["']/gi) ?? [];
            for (const t of tags) {
              const v = (t.match(/hreflang=["']([^"']+)["']/i)?.[1] ?? "").trim();
              // lang (2-3 letters) + optional script (4 letters, e.g. zh-Hant) + optional region (2 letters)
              if (!/^[a-z]{2,3}(-[a-z]{4})?(-[a-z]{2})?$|^x-default$/i.test(v)) {
                return { kind: "other", note: `invalid hreflang value '${v.slice(0, 30)}'` };
              }
            }
            return null;
          })
        : null, 4),
    c("S23", "Canonical resolves to this page (no cross-page mismatch)", "seo", 5, "medium",
      // A canonical pointing to a DIFFERENT page tells Google to drop this one in favour of that URL - a
      // silent de-indexing if unintended. Pass when there's no canonical (presence is S3) or it self-
      // references; fail only on a genuine different-path mismatch (trailing slash / query / case ignored).
      covR((p) => {
        const m =
          src(p).match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ??
          src(p).match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
        if (!m) return null;
        const self = meta(p).sourceURL ?? rootUrl;
        const origin = (self.match(/^https?:\/\/[^/]+/i)?.[0] ?? "");
        let canon = m[1].trim();
        // Resolve relative canonicals. A PROTOCOL-RELATIVE canonical ("//host/path") is a valid,
        // absolute reference still emitted by older CMS/CDN templates - it must become
        // "https://host/path", NOT origin + "//host/path" (which would mangle into a bogus
        // cross-page mismatch and raise a false "silent de-indexing" alarm on a correct site).
        // Order matters: test "//" before the single-"/" root-relative case.
        if (canon.startsWith("//")) canon = "https:" + canon;
        else if (canon.startsWith("/")) canon = origin + canon;
        const norm = (u: string) =>
          u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
        if (norm(canon) === norm(self)) return null;
        // Report the canonical's path only (origin + ?query stripped) so the reason is a clean URL,
        // never raw HTML or arbitrary attributes. Capped at 80 chars defensively.
        const canonPath = canon.replace(/^https?:\/\/[^/]+/i, "").replace(/[#?].*$/, "") || "/";
        return { kind: "mismatch", what: "canonical", expected: pathOf(self), actual: canonPath.slice(0, 80) };
      }), 2),

    // Tracking & Analytics - scored by detection confidence (see `det` / `tNA` above). "high", not
    // critical: a crawl cannot prove a tag is ABSENT, so these never trigger the critical floor, and
    // when no tracking is visible at all the whole dimension is N/A (excluded), never zeroed.
    cn("T1", "Analytics present", "tracking", 16, "high", tCfg(det.ga4), 3),
    cn("T2", "No legacy Universal Analytics", "tracking", 6, "high",
      anyTracking ? (det.ua ? 0 : 1) : null, 3),
    cn("T3", "Google Tag Manager", "tracking", 8, "medium",
      det.gtm ? 1 : null, 3), // positive-only: GTM is optional infra; its absence is not a fault
    cn("T5", "Consent Mode present", "tracking", 16, "high", tCfg(det.consent), 3),
    cn("T6", "Consent Mode v2 (ad_user_data + ad_personalization)", "tracking", 10, "high",
      tCfg(det.consentV2), 3),
    cn("T7", "Consent / CMP banner", "tracking", 12, "high", tNA(det.cmp), 4),
    cn("T8", "Ad/social pixels", "tracking", 6, "low", tNA(det.pixels), 2),
    cn("T12", "Session recording gated by consent", "tracking", 8, "medium",
      // A session recorder (Clarity/Hotjar/FullStory/...) must be gated by a CMP. N/A when we saw no
      // tracking at all (we could not assess the layer). Also N/A when a recorder is present but no CMP
      // is visible AND GTM is present: the CMP may be GTM-injected (invisible to a crawl), so we can't
      // rule it out - mirror T7's "GTM could inject the CMP" stance rather than hard-failing (0).
      !anyTracking
        ? null
        : det.recorder
          ? det.cmp
            ? 1
            : det.gtm
              ? null
              : 0
          : 1, 2),
    cn("T15", "dataLayer initialized", "tracking", 3, "low",
      det.dataLayer ? 1 : null, 1), // positive-only
    cn("T20", "Consent Mode default set before tags load", "tracking", 6, "medium",
      // Source-order check on the STATIC (no-JS) HTML only. A browser-rendered DOM has the gtm.js /
      // gtag.js loader injected to the very top of <head> by Google's snippet (insertBefore(j,
      // firstScript)), which flips the order and would false-fail a correctly configured site. So we
      // use aux.rootHtml - the separate no-JS GET of the root - as the only honest source. If it's
      // not present, or either marker isn't there, we report N/A instead of guessing.
      //
      // Patterns handled:
      //  PASS  - Standard GTM snippet: <script>gtag('consent','default',...)</script> followed by
      //          <script>(function(w,d,s,l,i){... 'gtm.js?id='+i ...})(...);</script>. The loader URL
      //          appears as a string inside the inline IIFE body, after the consent default.
      //  PASS  - Direct <script src="...gtag/js?id=G-..."> with the inline consent default above it.
      //  PASS  - Same-script setup: a single inline <script> that sets the default first, then either
      //          embeds the GTM URL or kicks off the loader - both markers in the same script body,
      //          cIdx < lIdx.
      //  PASS  - Multiple loaders (e.g. one gtag/js per measurement id): the *first* loader is what
      //          matters; if the consent default precedes the first match, it precedes them all.
      //  FAIL  - Loader / snippet placed above the consent default - the real privacy bug.
      //  N/A   - Consent default set client-side by a CMP (Cookiebot, OneTrust, etc.) without a
      //          literal gtag('consent','default') in static HTML.
      //  N/A   - Server-side GTM on a custom domain (not googletagmanager.com).
      //  N/A   - aux.rootHtml not fetched (e.g. root fetch failed, plain HTTP errors).
      (() => {
        const raw = aux.rootHtml ?? "";
        if (!raw) return null;
        const cIdx = raw.search(/gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]/i);
        const lIdx = raw.search(/googletagmanager\.com\/(?:gtm\.js|gtag\/js)/i);
        if (cIdx < 0 || lIdx < 0) return null;
        return cIdx < lIdx ? 1 : 0;
      })(), 3),

    // AI-Readiness / GEO
    c("G1", "Structured data (JSON-LD) present", "geo", 8, "high",
      // Weight 8 (was 12): "any JSON-LD present" overlaps G11 "typed schema entities" (12); G11 is the
      // stronger signal, so G1 is the lighter gate to avoid double-rewarding the same thing.
      covR((p) => /<script[^>]+type=["']application\/ld\+json["']/i.test(src(p)) ? null : { kind: "missing", what: "JSON-LD <script>" }), 2),
    cn("G3", "Server-side rendered content", "geo", 14, "high",
      // Real SSR signal: compare the NO-JS initial HTML (aux.rootHtml - a plain GET of the root, no
      // browser render) to the browser-RENDERED homepage. If the no-JS HTML already holds most of the
      // rendered text, the server rendered it; a near-empty no-JS shell that only fills in after JS is
      // client-rendered (CSR) - which a no-JS AI/search crawler sees as empty. N/A without the no-JS fetch
      // (so it never guesses - the old word-count-vs-itself heuristic could not tell SSR from CSR at all,
      // because Firecrawl returns the post-render DOM in rawHtml too).
      (() => {
        const raw = aux.rootHtml ?? "";
        if (!raw) return null;
        const home = sample.find((p) => hostOf(meta(p).sourceURL ?? "") === hostOf(rootUrl)) ?? sample[0];
        if (!home) return null;
        const strip = (s: string) =>
          s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
        const rawW = words(strip(raw));
        const renW = words(strip(html(home)));
        if (renW <= 20) return 1; // trivial page; nothing meaningful to render client-side
        return clamp01(rawW / Math.max(renW * 0.6, 1));
      })(), 5),
    c("G4", "Direct-answer opening", "geo", 10, "high",
      // Language-agnostic: a self-contained lead sentence (something an answer engine can lift)
      // appears before the first section heading - not a heading, list, quote, or image line.
      covR((p) => {
        for (const raw of md(p).split("\n")) {
          const l = raw.trim();
          if (!l) continue;
          if (/^#{1,6}\s/.test(l)) return { kind: "other", note: "first content line is a heading, not a lead paragraph" };
          if (/^(?:[-*>|!]|\d+\.\s)/.test(l)) continue; // skip list / quote / table / image lines
          const len = l.replace(/[#*_`>[\]()]/g, "").trim().length;
          if (len >= 60 && len <= 400 && /[.!?。]$/.test(l)) return null; // pass: a real, liftable sentence
          if (len >= 60) return { kind: "other", note: "lead paragraph found but it is too long or lacks ending punctuation" };
        }
        return { kind: "other", note: "no lead paragraph (60-400 chars) before the first heading" };
      }), 3),
    c("G5", "Q&A / FAQ structure", "geo", 8, "medium",
      covR((p) => /FAQPage|"@type"\s*:\s*"Question"/i.test(src(p)) || /(^|\n)#+[^\n]*\?/.test(md(p)) || /<summary[^>]*>[^<]*\?/i.test(html(p)) ? null : { kind: "missing", what: "Q&A / FAQ structure" }), 3),
    c("G6", "Statistics & data points", "geo", 8, "medium",
      // Concrete numbers make content more citable by AI engines (Princeton GEO). Language-agnostic:
      // percentages, currency, magnitudes (k/m/bn/million), and "N in M" / "Nx" ratios. (Outbound
      // citations are scored separately by G15 so the two signals don't double-count.)
      covR((p) => {
        const m = md(p);
        // Count GENUINE statistics, not bare unit-suffixed numbers. The old pattern matched lone
        // single-letter magnitudes ("5m" = 5 metres/minutes, "3x") as stats, inflating the GEO
        // score. Now: percentages and currency are unconditional (unambiguous); magnitude words
        // require >=2 digits (so "10k", "1.5m" count but "5m"/"3k" do not); "N in M" ratios stay;
        // the ambiguous bare "x" is dropped (a real ratio is caught by the "N in M" form).
        const stats =
          (m.match(/\d[\d.,]*\s*(?:%|‰|percent)\b/gi) ?? []).length +
          (m.match(/[€$£¥]\s?\d[\d.,]*/g) ?? []).length +
          (m.match(/\b\d{2,}[\d.,]*\s*(?:k|m|bn|million|billion|thousand)(?![a-z])/gi) ?? []).length +
          (m.match(/\b\d+\s*(?:in|of|out of)\s*\d+\b/gi) ?? []).length;
        return stats >= 3 ? null : { kind: "wrong_count", what: "concrete statistics (%, currency, ratios)", actual: stats, expected: 3 };
      }), 4),
    c("G7", "Freshness signals", "geo", 6, "medium",
      // Recency-scored, not presence-only: parse the declared dateModified/datePublished/<time datetime>
      // and score by age (<=90d -> 1, decaying to 0.1 by ~2 years). A freshness mechanism with no
      // parseable date gets partial credit; nothing gets 0.
      clamp01(
        sample.reduce((s, p) => {
          const t = src(p);
          const m =
            t.match(/"date(?:Modified|Published)"\s*:\s*"([^"]+)"/i) ??
            t.match(/<time[^>]+datetime=["']([^"']+)["']/i);
          if (!m) return s + (/last updated|<time/i.test(t) ? 0.3 : 0);
          const d = Date.parse(m[1]);
          if (Number.isNaN(d)) return s + 0.3;
          const days = (Date.now() - d) / 86_400_000;
          return s + (days <= 90 ? 1 : days >= 730 ? 0.1 : 1 - ((days - 90) / 640) * 0.9);
        }, 0) / n,
      ), 3),
    c("G8", "Authorship / E-E-A-T", "geo", 6, "medium",
      covR((p) => /"author"|rel=["']author["']|"Organization"|"sameAs"/i.test(src(p)) ? null : { kind: "missing", what: "author / Organization / sameAs signals" }), 3),
    cn("G9", "AI crawlers not blocked", "geo", 8, "high",
      !aux.robotsFetched ? null : robotsBlocksAiCrawler(aux.robotsTxt ?? "") ? 0 : 1, 2),
    c("G11", "Typed schema entities", "geo", 12, "high",
      // Reward the RIGHT JSON-LD types (not just any JSON-LD): an Organization with a name, an Article
      // with author + date, a Product with offers/rating, or FAQ/HowTo/Breadcrumb/LocalBusiness.
      covR((p) => {
        const s = src(p);
        const pass = (
          (/"@type"\s*:\s*"Organization"/i.test(s) && /"(?:name|sameAs|logo)"\s*:/i.test(s)) ||
          (/"@type"\s*:\s*"(?:Article|BlogPosting|NewsArticle)"/i.test(s) && /"author"\s*:/i.test(s) && /"datePublished"\s*:/i.test(s)) ||
          (/"@type"\s*:\s*"Product"/i.test(s) && /"(?:offers|aggregateRating)"\s*:/i.test(s)) ||
          /"@type"\s*:\s*"(?:FAQPage|HowTo|BreadcrumbList|Recipe|Event|LocalBusiness)"/i.test(s)
        );
        return pass ? null : { kind: "missing", what: "typed schema (Organization / Article / Product / FAQ / HowTo / ...)" };
      }), 3),
    c("G12", "Snippet-eligible (no nosnippet)", "geo", 8, "high",
      // AI Overviews / answer engines can only cite snippet-eligible pages; nosnippet or max-snippet:0
      // silently blocks citation.
      // Per-page <meta robots> nosnippet, OR the root X-Robots-Tag response header (which can carry
      // nosnippet too; we only have the root URL's headers, so that gates all pages). data-nosnippet
      // element attributes remain out of scope.
      covR((p) => /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*(?:nosnippet|max-snippet:\s*0)/i.test(src(p)) || /nosnippet|max-snippet:\s*0/i.test(hdr("x-robots-tag")) ? { kind: "other", note: "nosnippet / max-snippet:0 directive blocks citation" } : null), 1),
    c("G14", "Extractable formatting (lists/tables)", "geo", 6, "medium",
      // Lists and tables are the formats answer engines lift verbatim.
      covR((p) => {
        const m = md(p);
        const items = (m.match(/^\s*(?:[-*]\s+|\d+\.\s+)/gm) ?? []).length;
        const rows = (m.match(/^\s*\|.*\|\s*$/gm) ?? []).length;
        if (items >= 3 || rows >= 2 || /<table[\s>]/i.test(html(p))) return null;
        return { kind: "missing", what: "extractable lists or tables" };
      }), 2),
    c("G15", "Outbound authoritative citations", "geo", 8, "medium",
      // Citing sources is the single largest measured GEO lift (Princeton). Count external links to
      // authoritative hosts (.gov/.edu/.int, Wikipedia/Wikidata, doi.org, WHO/NIH, europa.eu, etc.).
      covR((p) => {
        const self = hostOf(meta(p).sourceURL ?? rootUrl);
        const re = /\]\((https?:\/\/[^)]+)\)/gi;
        let m: RegExpExecArray | null;
        let authoritative = 0;
        while ((m = re.exec(md(p)))) {
          const h = hostOf(m[1]);
          if (!h || h === self) continue;
          if (/\.(?:gov|edu|int)(?:\.[a-z]{2})?$/.test(h) ||
              /(?:^|\.)(?:wikipedia\.org|wikidata\.org|doi\.org|who\.int|nih\.gov|nature\.com|nasa\.gov|europa\.eu|reuters\.com|ft\.com|arxiv\.org|ieee\.org|gartner\.com|statista\.com|mckinsey\.com)$/.test(h))
            authoritative++;
        }
        return authoritative >= 1 ? null : { kind: "missing", what: "outbound citation to an authoritative source" };
      }), 3),

    // --- GEO additions (2026 research: Princeton GEO study + Juma rubric; all crawl-measurable) ---
    cn("G16", "llms.txt present", "geo", 2, "low",
      // An opt-in markdown index for AI engines. Low weight: Google opts out and there's no proven
      // citation correlation yet, but it's a cheap, forward-looking signal. N/A until the aux fetch runs.
      aux.llmsTxtFound === undefined ? null : aux.llmsTxtFound ? 1 : 0, 1),
    cn("G17", "Entity consistency (brand agrees across schema / og:site_name / title)", "geo", 6, "medium",
      // AI engines merge mentions to ONE entity only when the brand name is consistent. Compare the two
      // explicit brand declarations (og:site_name + Organization schema name); the <title> is a weak
      // cross-check. Scored ONLY over pages that declare a brand; if none do, the check is N/A - you
      // can't be "inconsistent" with nothing, and the missing schema is already penalized by G1/G11/G18.
      (() => {
        const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
        const scores: number[] = [];
        for (const p of sample) {
          const s = src(p);
          const og =
            s.match(/property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
            s.match(/content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i)?.[1];
          const org = s.match(/"@type"\s*:\s*"Organization"[\s\S]{0,300}?"name"\s*:\s*"([^"]+)"/i)?.[1];
          const ogN = og ? norm(og) : "";
          const orgN = org ? norm(org) : "";
          const titleN = norm(meta(p).title ?? "");
          const decls = [ogN, orgN].filter(Boolean);
          if (decls.length === 0) continue;
          if (decls.length === 2) scores.push(ogN.includes(orgN) || orgN.includes(ogN) ? 1 : 0.3);
          else scores.push(titleN.includes(decls[0]) ? 1 : 0.5);
        }
        return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      })(), 2),
    c("G18", "Organization sameAs profiles (Wikidata / Wikipedia / socials)", "geo", 4, "low",
      // sameAs links are the strongest LLM disambiguation anchor (especially a Wikipedia/Wikidata URL).
      covR((p) => {
        const block = src(p).match(/"sameAs"\s*:\s*\[([\s\S]*?)\]/i)?.[1] ?? "";
        if (!block) return { kind: "missing", what: "Organization.sameAs JSON-LD block" };
        if (/wikipedia\.org|wikidata\.org/i.test(block)) return null;
        const links = (block.match(/https?:\/\/[^"']+/gi) ?? []).length;
        return links >= 2 ? null : { kind: "wrong_count", what: "sameAs URLs (Wikipedia/Wikidata or 2+ socials)", actual: links, expected: 2 };
      }), 2),
    c("G19", "Sections open with a direct answer (per H2)", "geo", 8, "medium",
      // The strongest validated GEO signal: each H2 section opens with a self-contained, quotable answer
      // (30-130 words, not a pronoun/filler opener). Scored as the fraction of H2 sections with a good
      // opener, averaged across pages; a page with no H2 structure scores 0 (nothing extractable).
      // NOT a duplicate of G4 (so no weight reduction like G1/G11): G4 scores ONLY the page's lead
      // paragraph BEFORE the first heading; G19 scores the openers AFTER each H2. Different text
      // positions - a direct-answer-styled page is rewarded once for its intro (G4) and once per section
      // (G19), which is intentional (both are distinct, real answer-engine signals).
      clamp01(
        sample.reduce((acc, p) => {
          const sections = md(p).split(/^##\s+.+$/gm).slice(1);
          if (sections.length === 0) return acc + 0;
          const good = sections.filter((sec) => {
            for (const raw of sec.split("\n")) {
              const l = raw.trim();
              if (!l) continue;
              if (/^#{1,6}\s/.test(l)) return false; // a sub-heading before any prose
              if (/^(?:[-*>!|]|\d+\.\s)/.test(l)) continue; // skip list / quote / table / image
              const clean = l.replace(/[#*_`>[\]()]/g, "").trim();
              const wc = clean.split(/\s+/).filter(Boolean).length;
              if (wc < 30 || wc > 130) return false;
              // filler/continuation openers (not a self-contained answer) - EN + common Western-EU pronouns
              if (/^(?:it|this|that|these|those|they|we|our|here|below|es|sie|wir|dies|diese|hier|il|elle|nous|ici|ce|cette|esto|esta|este|nosotros|questo|questa|deze|dit|това|този|тази|тези|тук|ние|те|нашия|нашата|нашите|это|этот|эта|эти|здесь|мы|они)(?![A-Za-z0-9_Ѐ-ӿ])/i.test(clean)) return false;
              return true;
            }
            return false;
          }).length;
          return acc + good / sections.length;
        }, 0) / n,
      ), 4),
    c("G20", "TL;DR / Key Takeaways block near the top", "geo", 4, "medium",
      // A quotable summary block in the top quarter of the page is content AI engines lift verbatim.
      covR((p) => {
        const m = md(p);
        if (!m) return { kind: "missing", what: "page content" };
        const top = m.slice(0, Math.max(500, Math.floor(m.length * 0.25)));
        const headingRe =
          /(?:^|\n)#{1,6}\s*(?:tl;?dr|key takeaways|in short|in summary|summary|key points|at a glance|the gist|resumen|zusammenfassung|in sintesi|in breve|samenvatting|points? cl[eé]s|en bref|punti chiave|resumo|kernpunten|резюме|обобщение|накратко|ключови изводи|ключови точки|кратко|итоги|ключевые выводы|резиме|podsumowanie|w skrócie|najważniejsze|rezumat|pe scurt)(?![A-Za-z0-9_Ѐ-ӿ])/i;
        const idx = top.search(headingRe);
        if (idx < 0) return { kind: "missing", what: "TL;DR / Key Takeaways heading in the top quarter" };
        if (/(?:^|\n)\s*(?:[-*]\s+|\d+\.\s+)/.test(top.slice(idx))) return null;
        return { kind: "other", note: "Key Takeaways heading found but no bullet/numbered list follows" };
      }), 2),

    // Tech Basics
    c("TB1", "HTTPS", "tech", 16, "critical",
      covR((p) => (meta(p).sourceURL ?? rootUrl).startsWith("https://") ? null : { kind: "non_https" }), 2),
    cn("TB5", "robots.txt allows crawling", "tech", 8, "critical",
      !aux.robotsFetched ? null : robotsBlocksWholeSite(aux.robotsTxt ?? "") ? 0 : 1, 1),
    c("TB3", "No mixed content", "tech", 8, "high",
      covR((p) => {
        const u = meta(p).sourceURL ?? rootUrl;
        if (!u.startsWith("https://")) return null; // HTTPS check is TB1; not "mixed" if page itself is http
        // Mixed content = insecure SUB-RESOURCES (src/srcset/poster, stylesheet href, CSS url()), not
        // ordinary <a href="http://"> navigation, which browsers don't block or warn on.
        const srcRefs = (html(p).match(/\b(?:src|srcset|poster)=["']http:\/\//gi) ?? []).length;
        const linkRefs = (html(p).match(/<link[^>]+href=["']http:\/\//gi) ?? []).length;
        const cssRefs = (html(p).match(/url\(\s*['"]?http:\/\//gi) ?? []).length;
        const total = srcRefs + linkRefs + cssRefs;
        return total === 0 ? null : { kind: "wrong_count", what: "insecure http:// sub-resources on an HTTPS page", actual: total, expected: 0 };
      }), 2),
    c("TB4", "Mobile viewport", "tech", 14, "critical",
      covR((p) => /<meta[^>]+name=["']viewport["']/i.test(src(p)) ? null : { kind: "missing", what: "<meta name=\"viewport\"> tag" }), 1),
    c("TB10", "Charset & lang declared", "tech", 6, "low",
      covR((p) => {
        const hasCharset = /<meta[^>]+charset/i.test(src(p));
        const hasLang = /<html[^>]+lang=/i.test(src(p));
        if (hasCharset && hasLang) return null;
        if (!hasCharset && !hasLang) return { kind: "missing", what: "<meta charset> and <html lang>" };
        return { kind: "missing", what: !hasCharset ? "<meta charset>" : "<html lang>" };
      }), 1),
    c("TB12", "Favicon", "tech", 4, "low",
      covR((p) => /<link[^>]+rel=["'][^"']*icon/i.test(src(p)) ? null : { kind: "missing", what: "favicon <link rel=\"icon\">" }), 1),
    // Static performance hygiene (proxies, not field CWV): images declare width/height (CLS) and
    // <script src> tags are async/deferred (don't block render). Averaged per page over what's present.
    c("TB6", "Layout stability (img dimensions, CLS proxy)", "tech", 6, "medium",
      // CLS proxy (not measured CWV): images declare width+height or an aspect-ratio so they don't
      // reflow as they load. Averaged per page over the images present.
      clamp01(sample.reduce((s, p) => {
        const imgs = html(p).match(/<img\b[^>]*>/gi) ?? [];
        if (!imgs.length) return s + 1;
        const ok = imgs.filter((t) => (/\bwidth=/i.test(t) && /\bheight=/i.test(t)) || /aspect-ratio/i.test(t)).length;
        return s + ok / imgs.length;
      }, 0) / n), 3),
    cn("TB20", "No render-blocking scripts in <head>", "tech", 6, "medium",
      // Synchronous <script src> (no async/defer/module) inside <head> blocks first paint (LCP proxy).
      // Only assessable when we can actually isolate the <head>: if the regex misses, the old fallback to
      // html(p) (head-stripped) made `[].every(...)` PASS vacuously even when render-blocking scripts
      // exist. Instead, score over pages whose <head> we could extract; if none could be extracted, N/A.
      (() => {
        const assessable = sample
          .map((p) => rawHtml(p).match(/<head[\s>][\s\S]*?<\/head>/i)?.[0])
          .filter((h): h is string => h !== undefined);
        if (assessable.length === 0) return null;
        return clamp01(
          assessable.reduce((s, head) => {
            const scripts = head.match(/<script\b[^>]*\bsrc=[^>]*>/gi) ?? [];
            return s + (scripts.every((t) => /\b(?:async|defer)\b|type=["']module["']/i.test(t)) ? 1 : 0);
          }, 0) / assessable.length,
        );
      })(), 3),
    c("TB19", "Modern image formats & lazy-loading", "tech", 6, "medium",
      // WebP/AVIF (or <picture>) + lazy-loaded images cut transfer and improve LCP. Per-page average.
      clamp01(sample.reduce((s, p) => {
        const h = html(p);
        const imgs = h.match(/<img\b[^>]*>/gi) ?? [];
        if (!imgs.length) return s + 1;
        const cdnOpt = imgs.filter((t) => /res\.cloudinary\.com|\.imgix\.net|imagedelivery\.net|\/cdn-cgi\/image\/|\/_next\/image|\/_vercel\/image|cdn\.shopify\.com|\.twic\.pics|wsrv\.nl/i.test(t)).length;
        const modern = Math.min((h.match(/\.(?:webp|avif)\b/gi) ?? []).length + (h.match(/<picture[\s>]/gi) ?? []).length + cdnOpt, imgs.length);
        const lazy = imgs.filter((t) => /loading=["']lazy["']/i.test(t)).length;
        return s + clamp01((modern / imgs.length + lazy / imgs.length) / 2);
      }, 0) / n), 3),
    c("TB22", "Valid HTML5 doctype", "tech", 3, "low",
      covR((p) => /^\s*<!doctype html>/i.test(rawHtml(p)) ? null : { kind: "missing", what: "<!DOCTYPE html> at document start" }), 1),

    // Security headers (folded into Tech Basics). Read once from the root URL's HTTP response (not
    // per page - these are set server/CDN-wide); N/A when headers weren't fetched (unit tests, or the
    // root fetch failed) so they never penalize. None is "critical" - a missing header is a real finding
    // but not a fatal, floor-the-grade issue, and plenty of legitimate sites omit some.
    cn("TB30", "HSTS (Strict-Transport-Security)", "tech", 6, "medium",
      // Value-aware: a present-but-disabling max-age=0 is not protection; full credit needs >=1 year.
      !aux.headersFetched ? null : (() => { const v = hdr("strict-transport-security"); if (!v) return 0; const m = v.match(/max-age=(\d+)/i); const age = m ? Number(m[1]) : 0; return age >= 31536000 ? 1 : age > 0 ? 0.5 : 0; })(), 1),
    cn("TB31", "Content-Security-Policy", "tech", 5, "medium",
      // Value-aware: a CSP with unsafe-inline/unsafe-eval in effect provides little XSS protection (partial credit).
      !aux.headersFetched ? null : (() => { const v = hdr("content-security-policy"); if (!v) return 0; return /unsafe-inline|unsafe-eval/i.test(v) ? 0.5 : 1; })(), 3),
    cn("TB32", "X-Content-Type-Options: nosniff", "tech", 3, "low",
      !aux.headersFetched ? null : /nosniff/i.test(hdr("x-content-type-options")) ? 1 : 0, 1),
    cn("TB33", "Clickjacking protection (X-Frame-Options / frame-ancestors)", "tech", 5, "medium",
      !aux.headersFetched ? null : has("x-frame-options") || /frame-ancestors/i.test(hdr("content-security-policy")) ? 1 : 0, 2),
    cn("TB34", "Referrer-Policy", "tech", 3, "low",
      !aux.headersFetched ? null : has("referrer-policy") ? 1 : 0, 1),
    cn("TB35", "Permissions-Policy", "tech", 2, "low",
      !aux.headersFetched ? null : has("permissions-policy") || has("feature-policy") ? 1 : 0, 1),
  ];
  // Apply verified semantic verdicts over the heuristic ratios for the 4 GEO semantic checks (see note).
  // When a verdict applies, the score came from the grounded LLM (not the per-page heuristic), so replace
  // the heuristic's failing-page evidence with a semantic "where" label rather than a misleading page list.
  for (const ch of out) {
    if (SEMANTIC_IDS.has(ch.id) && typeof sem[ch.id] === "number") {
      ch.ratio = clamp01(sem[ch.id] as number);
      ch.evidence = { where: "Assessed over the page's content (grounded semantic check)" };
    }
  }

  // "Where we checked" labels. Per-page checks already carry the default "Across all N pages" (+ failing
  // list) from mkEvidence; the entries below relabel the checks whose source is NOT the per-page crawl
  // (robots.txt, separate fetches, root response headers, cross-page comparisons, site-level tracking
  // detection). N/A checks are skipped - their "Why N/A" text already explains them.
  const trackingWhere =
    `Tag/script detection across all ${n} crawled page${n === 1 ? "" : "s"}` +
    (gtm ? " plus the GTM container" : "");
  const WHERE_OVERRIDE: Record<string, string> = {
    T1: trackingWhere, T2: trackingWhere, T3: trackingWhere, T5: trackingWhere, T6: trackingWhere,
    T7: trackingWhere, T8: trackingWhere, T12: trackingWhere, T15: trackingWhere, T20: trackingWhere,
    S14: "A fetch of /sitemap.xml (and the robots.txt Sitemap: directive)",
    G9: "The site's robots.txt",
    G16: "A fetch of /llms.txt",
    G3: "The no-JS initial HTML of the home page vs. the rendered page",
    G12: `Each of the ${n} crawled pages, plus the root URL's X-Robots-Tag header`,
    S15: `Page titles compared across all ${n} crawled pages`,
    S16: `Meta descriptions compared across all ${n} crawled pages`,
    G17: `Brand name compared across all ${n} crawled pages`,
    TB5: "The site's robots.txt",
    TB30: "The root URL's response headers", TB31: "The root URL's response headers",
    TB32: "The root URL's response headers", TB33: "The root URL's response headers",
    TB34: "The root URL's response headers", TB35: "The root URL's response headers",
  };
  for (const ch of out) {
    if (ch.ratio === null) continue; // N/A: explained by whenNA; no evidence needed
    const w = WHERE_OVERRIDE[ch.id];
    if (w) {
      if (ch.evidence) ch.evidence.where = w;
      else ch.evidence = { where: w };
    } else if (!ch.evidence) {
      // Per-page partial checks (image alt, freshness, per-H2, CLS, image formats, head scripts) that
      // pass a raw ratio instead of cov(): give them the default per-page "where" (no page list in v1).
      ch.evidence = { where: `Across all ${n} crawled page${n === 1 ? "" : "s"}`, checked: n };
    }
  }
  return { checks: out, pages: auditedPages, pagesWithIssues: pagesWithIssuesSet.size };
}

/** Backward-compatible wrapper: the old `runChecks` returns only the CheckResult[] so existing
 *  callers (rubric.ts, the test suite) stay green without churn. New code uses `runAudit` for the
 *  full output including the per-page rollups. */
export function runChecks(pages: CrawledPage[], rootUrl = "", aux: AuditAux = {}): CheckResult[] {
  return runAudit(pages, rootUrl, aux).checks;
}
