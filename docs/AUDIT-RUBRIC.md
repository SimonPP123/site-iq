# Site IQ Audit Rubric

This is the full, authoritative rubric behind a Site IQ score. The logic lives in typed,
unit-tested TypeScript (`src/lib/audit/checks.ts` and `scoring.ts`) and is mirrored 1:1 into the
n8n "Run checks" / "Score" Code nodes (a parity test, `src/lib/audit/parity.test.ts`, guards against
drift). Nothing here is AI-generated: the score is deterministic. AI is used only for the prose
summary and the chat agent.

## Dimensions and weights

The overall score is a weighted average of four dimensions:

| Dimension | Weight | What it measures |
|---|---:|---|
| SEO | 30% | Can search engines find, understand, and rank the pages? |
| Tracking & Analytics | 25% | Is measurement present and consent/privacy handled (GA4, Consent Mode v2, CMP)? |
| AI-Readiness (GEO) | 25% | Can AI answer-engines read and cite the content (schema, SSR, AI-crawler access)? |
| Tech Basics | 20% | HTTPS, crawlability, mobile, static performance hygiene, security response headers. |

Per-check `weight` values are **relative within a dimension**; the dimension score renormalizes by
the sum of *applicable* weights, so they do not need to total 100.

## The 58 checks

Severity drives the action-plan impact and, for `critical` checks only, the failure floor (below).
`effort` (1-5) is the estimated work to fix, used to rank the action plan. Checks run over up to
**10 sampled pages** (homepage + the most commercially relevant pages).

### SEO (15 checks - 14 here + S23 in "Added 2026-05" below)

| ID | Check | Severity | Weight | Effort |
|---|---|---|---:|---:|
| S1 | Title present (15-60 chars) | high | 10 | 1 |
| S2 | Meta description (70-160 chars) | medium | 7 | 1 |
| S3 | Canonical tag present | high | 8 | 2 |
| S4 | Indexable (no `noindex`) | **critical** | 12 | 1 |
| S5 | At least one H1 | medium | 7 | 2 |
| S10 | Content depth (>= 300 words) | medium | 7 | 4 |
| S12 | Open Graph tags | low | 4 | 1 |
| S13 | Image alt coverage | low | 3 | 2 |
| S14 | XML sitemap present | medium | 5 | 2 |
| S15 | Unique page titles (cross-page) | high | 8 | 2 |
| S16 | Unique meta descriptions (cross-page) | medium | 5 | 2 |
| S17 | No broken pages (4xx/5xx) | high | 9 | 1 |
| S18 | Logical heading hierarchy | medium | 6 | 3 |
| S21 | Valid hreflang (multilingual sites) | medium | 6 | 4 |

### Tracking & Analytics (10 checks - 9 here + T20 in "Added 2026-05" below)

| ID | Check | Severity | Weight | Effort |
|---|---|---|---:|---:|
| T1 | Analytics present (GA4 or privacy-first) | high | 16 | 3 |
| T2 | No legacy Universal Analytics (`UA-` / analytics.js) | high | 6 | 3 |
| T3 | Google Tag Manager | medium | 8 | 3 |
| T5 | Consent Mode present (v1) | high | 16 | 3 |
| T6 | Consent Mode v2 (`ad_user_data` + `ad_personalization`) | high | 10 | 3 |
| T7 | Consent / CMP banner | high | 12 | 4 |
| T8 | Ad / social pixels | low | 6 | 2 |
| T12 | Session recording gated by consent | medium | 8 | 2 |
| T15 | dataLayer initialized | low | 3 | 1 |

> **Tracking is intentionally never `critical`.** GA4, Consent Mode and the CMP banner are routinely
> injected by a tag manager (GTM, Tealium, Segment) at runtime and may be invisible to a single
> static crawl, so the engine cannot prove their *absence*. A heavily-weighted miss still tanks the
> Tracking dimension and tops the action plan, but it must not collapse the whole headline grade on a
> signal we cannot read with confidence. The report surfaces a caveat when tracking looks incomplete.

### AI-Readiness / GEO (17 checks - 12 here + G16-G20 in "Added 2026-05" below)

| ID | Check | Severity | Weight | Effort |
|---|---|---|---:|---:|
| G1 | Structured data (JSON-LD) present | high | 8 | 2 |
| G3 | Server-side rendered content | high | 14 | 5 |
| G4 | Direct-answer opening (lead sentence) | high | 10 | 3 |
| G5 | Q&A / FAQ structure | medium | 8 | 3 |
| G6 | Statistics & data points | medium | 8 | 4 |
| G7 | Freshness signals | medium | 6 | 3 |
| G8 | Authorship / E-E-A-T | medium | 6 | 3 |
| G9 | AI crawlers not blocked in robots.txt | high | 8 | 2 |
| G11 | Typed schema entities (Org/Article/Product/FAQ...) | high | 12 | 3 |
| G12 | Snippet-eligible (no `nosnippet`) | high | 8 | 1 |
| G14 | Extractable formatting (lists / tables) | medium | 6 | 2 |
| G15 | Outbound authoritative citations | medium | 8 | 3 |

### Tech Basics (16 checks)

| ID | Check | Severity | Weight | Effort |
|---|---|---|---:|---:|
| TB1 | HTTPS | **critical** | 16 | 2 |
| TB3 | No mixed content | high | 8 | 2 |
| TB4 | Mobile viewport | **critical** | 14 | 1 |
| TB5 | robots.txt allows crawling | **critical** | 8 | 1 |
| TB6 | Layout stability (img dimensions, CLS proxy) | medium | 6 | 3 |
| TB10 | Charset & language declared | low | 6 | 1 |
| TB12 | Favicon | low | 4 | 1 |
| TB19 | Modern image formats & lazy-loading | medium | 6 | 3 |
| TB20 | No render-blocking scripts in `<head>` | medium | 6 | 3 |
| TB22 | Valid HTML5 doctype | low | 3 | 1 |
| TB30 | HSTS (Strict-Transport-Security) | medium | 6 | 1 |
| TB31 | Content-Security-Policy | medium | 5 | 3 |
| TB32 | X-Content-Type-Options: nosniff | low | 3 | 1 |
| TB33 | Clickjacking protection (X-Frame-Options / frame-ancestors) | medium | 5 | 2 |
| TB34 | Referrer-Policy | low | 3 | 1 |
| TB35 | Permissions-Policy | low | 2 | 1 |

Security headers (TB30-TB35) are read once from the root URL's HTTP response and are **N/A** when that
fetch fails. None is `critical` - a missing header is a real finding, not a fatal, grade-flooring issue.

### Added 2026-05 (+7 checks)

| ID | Check | Dim | Severity | Weight |
|---|---|---|---|---|
| S23 | Canonical resolves to this page (no cross-page mismatch) | SEO | medium | 5 |
| T20 | Consent Mode default set before tags load | Tracking | medium | 6 |
| G16 | llms.txt present | GEO | low | 2 |
| G17 | Entity consistency (brand agrees across schema / og:site_name / title) | GEO | medium | 6 |
| G18 | Organization sameAs profiles (Wikidata / Wikipedia / socials) | GEO | low | 4 |
| G19 | Sections open with a direct answer (per H2) | GEO | medium | 8 |
| G20 | TL;DR / Key Takeaways block near the top | GEO | medium | 4 |

Tracking also verifies analytics + Consent Mode from the public GTM container (`gtm.js`) when present, so
consent-gated tags become VERIFIED rather than N/A. `checks.ts` is the source of truth (58 checks total).

## Scoring

Each check returns a **ratio in [0, 1]**: `1` = passes on every sampled page, `0` = fails, a fraction
= partial coverage (for example, 3 of 10 pages have a valid title). Some checks return **N/A** (`null`)
when their input was not gathered (for example, robots.txt / sitemap checks in environments where the
auxiliary fetch did not run). N/A checks are **renormalized out** so a site is never penalized for
something that could not be measured.

```
dimension_score = 100 * Σ(weight · ratio) / Σ(weight)      over APPLICABLE checks only
overall         = 0.30·SEO + 0.25·Tracking + 0.25·GEO + 0.20·Tech
```

### Critical-failure floor

A failing (`ratio === 0`) **critical** check applies a two-level floor so one catastrophic issue
cannot be hidden by strong averages:

1. The affected **dimension** is capped at **59** (a D at best).
2. The **overall** score is dropped to one grade band below whatever the weighted math produced
   (for example, math of 88 with a critical failure becomes 79, a C).

Only `critical` checks (S4, TB1, TB4, TB5) can trigger the floor, because they are the signals a
static crawl reads with high confidence and that genuinely zero a site's visibility.

### Grade bands

| Grade | Range |
|---|---|
| A | 90-100 |
| B | 80-89 |
| C | 70-79 |
| D | 60-69 |
| F | 0-59 |

The headline overall score is an integer; per-dimension scores keep one decimal.

## Action plan

Every applicable check with `ratio < 1` becomes an action item, ranked by:

```
priority = impact · 2 - effort
```

where `impact` derives from severity (critical 5 ... info 1) and `effort` is the per-check estimate.
Items are tagged **quick win** (`impact >= 4 && effort <= 2`) and **needs approval** (any Tracking
change, since these usually require sign-off and a tag-manager deploy). Ties break by severity.

## Honest limits

- **Up-to-10-page snapshot, not a full-site crawl.** Site IQ samples the homepage plus the most
  commercially relevant pages. It complements crawler-grade tools (Ahrefs, Screaming Frog), it does
  not replace them for site-wide patterns (duplicate titles, orphan pages, broken-link clusters).
- **A static crawl cannot see runtime-injected tags.** See the Tracking note above; the report says
  so in-context rather than scoring a likely-fine site as negligent.
- **Static performance proxy.** TB6 checks image dimensions and script deferral as a hygiene proxy.
  For real Core Web Vitals / field data, use PageSpeed Insights.
