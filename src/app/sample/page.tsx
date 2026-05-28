import type { Metadata } from "next";
import { ReportView, type Report } from "@/components/report/ReportView";

// Public, indexable sample so anyone (a visitor) can see exactly what a report looks
// like without signing up - the real report UI rendered from canned, illustrative data.
export const metadata: Metadata = {
  title: "Sample report",
  description:
    "See a sample Site IQ report - one 0-100 grade across SEO, tracking, AI-readiness (GEO) and tech, with a plain-English summary and a prioritized list of fixes.",
  alternates: { canonical: "/sample" },
  robots: { index: true, follow: true },
};

// Illustrative data for a fictional store. Realistic scores + findings, rendered through the exact
// same ReportView the live product uses. Check ids match the rubric so "Why & how to fix" expands.
const SAMPLE: Report = {
  id: "sample",
  domain: "northwind-coffee.com",
  status: "done",
  score_overall: 68,
  error: null,
  result: {
    overall: 68,
    grade: "D",
    capped: false,
    pagesSampled: 8,
    pagesAttempted: 10,
    // Phase 2B per-audit page metadata. Lets the CrawledPagesSection show WHICH 8 pages were audited
    // and surface the 1-of-10 that the SENSITIVE_PATH_RE filter dropped (a fictional /admin path on
    // this fictional store). The mirror invariant - every evidence.failing[].path appears below -
    // is exercised by the contract test on the engine output.
    pages: [
      { path: "/" },
      { path: "/menu" },
      { path: "/about" },
      { path: "/locations" },
      { path: "/wholesale" },
      { path: "/blog/cold-brew-guide" },
      { path: "/contact" },
      { path: "/careers" },
    ],
    pagesWithIssues: 8,
    pagesExcluded: 1,
    // Phase 2E: one fictional URL Firecrawl could not crawl - shows how the "could not be crawled"
    // note renders. In real audits this is the SENSITIVE_PATH_RE-clean URLs whose pages timed out,
    // returned 4xx/5xx, or came back empty.
    pagesFailed: [
      { path: "/old-promo", reason: "4xx" },
    ],
    dimensions: [
      {
        id: "seo",
        label: "SEO",
        score: 74,
        rawScore: 74,
        capped: false,
        checks: [
          { id: "S1", label: "Title tag present and well-sized", ratio: 1, evidence: { where: "Across all 8 crawled pages", checked: 8 } },
          { id: "S4", label: "Indexable (no noindex)", ratio: 1, evidence: { where: "Across all 8 crawled pages", checked: 8 } },
          { id: "S2", label: "Meta description (70-160 chars)", ratio: 1, evidence: { where: "Across all 8 crawled pages", checked: 8 } },
          { id: "S12", label: "Open Graph tags", ratio: 0, evidence: { where: "Across all 8 crawled pages", checked: 8, failing: [
            { path: "/",                       reason: { kind: "missing", what: "og:title and og:image" } },
            { path: "/menu",                   reason: { kind: "missing", what: "og:title and og:image" } },
            { path: "/about",                  reason: { kind: "missing", what: "og:title and og:image" } },
            { path: "/locations",              reason: { kind: "missing", what: "og:title and og:image" } },
            { path: "/wholesale",              reason: { kind: "missing", what: "og:title and og:image" } },
            { path: "/blog/cold-brew-guide",   reason: { kind: "missing", what: "og:title and og:image" } },
            { path: "/contact",                reason: { kind: "missing", what: "og:title and og:image" } },
            { path: "/careers",                reason: { kind: "missing", what: "og:title and og:image" } },
          ] } },
          { id: "S17", label: "Sampled pages return OK", ratio: 1, evidence: { where: "Across all 8 crawled pages", checked: 8 } },
          { id: "S21", label: "Valid hreflang", ratio: null },
        ],
      },
      {
        id: "tracking",
        label: "Tracking",
        score: 55,
        rawScore: 55,
        capped: false,
        checks: [
          { id: "T1", label: "Analytics present", ratio: 1, evidence: { where: "Tag/script detection across all 8 crawled pages plus the GTM container" } },
          { id: "T3", label: "Google Tag Manager", ratio: 1, evidence: { where: "Tag/script detection across all 8 crawled pages plus the GTM container" } },
          { id: "T7", label: "Consent / CMP banner", ratio: 0, evidence: { where: "Tag/script detection across all 8 crawled pages plus the GTM container" } },
          { id: "T20", label: "Consent default before tags load", ratio: 0, evidence: { where: "Tag/script detection across all 8 crawled pages plus the GTM container" } },
        ],
      },
      {
        id: "geo",
        label: "AI-Readiness",
        score: 61,
        rawScore: 61,
        capped: false,
        checks: [
          { id: "G3", label: "Server-side rendered content", ratio: 1, evidence: { where: "The no-JS initial HTML of the home page vs. the rendered page" } },
          { id: "G6", label: "Concrete stats and figures", ratio: 0.5, evidence: { where: "Across all 8 crawled pages", checked: 8, failing: [
            { path: "/",          reason: { kind: "wrong_count", what: "concrete statistics (%, currency, ratios)", actual: 1, expected: 3 } },
            { path: "/menu",      reason: { kind: "wrong_count", what: "concrete statistics (%, currency, ratios)", actual: 0, expected: 3 } },
            { path: "/locations", reason: { kind: "wrong_count", what: "concrete statistics (%, currency, ratios)", actual: 2, expected: 3 } },
            { path: "/contact",   reason: { kind: "wrong_count", what: "concrete statistics (%, currency, ratios)", actual: 0, expected: 3 } },
          ] } },
          { id: "G15", label: "Authoritative citations", ratio: 0, evidence: { where: "Across all 8 crawled pages", checked: 8, failing: [
            { path: "/",                       reason: { kind: "missing", what: "outbound citation to an authoritative source" } },
            { path: "/menu",                   reason: { kind: "missing", what: "outbound citation to an authoritative source" } },
            { path: "/about",                  reason: { kind: "missing", what: "outbound citation to an authoritative source" } },
            { path: "/locations",              reason: { kind: "missing", what: "outbound citation to an authoritative source" } },
            { path: "/wholesale",              reason: { kind: "missing", what: "outbound citation to an authoritative source" } },
            { path: "/blog/cold-brew-guide",   reason: { kind: "missing", what: "outbound citation to an authoritative source" } },
            { path: "/contact",                reason: { kind: "missing", what: "outbound citation to an authoritative source" } },
            { path: "/careers",                reason: { kind: "missing", what: "outbound citation to an authoritative source" } },
          ] } },
          { id: "G19", label: "Sections open with a direct answer", ratio: 0.5, evidence: { where: "Across all 8 crawled pages", checked: 8 } },
        ],
      },
      {
        id: "tech",
        label: "Tech",
        score: 80,
        rawScore: 80,
        capped: false,
        checks: [
          { id: "TB1", label: "Served over HTTPS", ratio: 1, evidence: { where: "Across all 8 crawled pages", checked: 8 } },
          { id: "TB4", label: "Mobile viewport", ratio: 1, evidence: { where: "Across all 8 crawled pages", checked: 8 } },
          { id: "TB6", label: "Fast initial response", ratio: 1, evidence: { where: "Across all 8 crawled pages", checked: 8 } },
          { id: "TB30", label: "HSTS header", ratio: 0, evidence: { where: "The root URL's response headers" } },
          { id: "TB31", label: "Content-Security-Policy", ratio: 0, evidence: { where: "The root URL's response headers" } },
        ],
      },
    ],
    actionPlan: [
      { checkId: "S12", finding: "Add Open Graph tags so shared links show a title, description and image", impact: 4, effort: 2, priority: 6, severity: "high", quickWin: true, requiresApproval: false },
      { checkId: "T7", finding: "Add a consent banner (CMP) so analytics and ad tags load only after consent", impact: 5, effort: 3, priority: 7, severity: "high", quickWin: false, requiresApproval: true },
      { checkId: "TB30", finding: "Add an HSTS header (Strict-Transport-Security) to enforce HTTPS", impact: 3, effort: 1, priority: 5, severity: "medium", quickWin: true, requiresApproval: false },
      { checkId: "T20", finding: "Set Consent Mode defaults before the tag loader runs", impact: 4, effort: 3, priority: 5, severity: "medium", quickWin: false, requiresApproval: true },
      { checkId: "TB31", finding: "Add a Content-Security-Policy to reduce cross-site-scripting risk", impact: 3, effort: 3, priority: 3, severity: "medium", quickWin: false, requiresApproval: false },
      { checkId: "G15", finding: "Cite authoritative sources so AI engines trust and quote your pages", impact: 3, effort: 3, priority: 3, severity: "medium", quickWin: false, requiresApproval: false },
      { checkId: "G6", finding: "Add concrete stats and figures so answers are quotable by AI engines", impact: 3, effort: 2, priority: 4, severity: "low", quickWin: false, requiresApproval: false },
      { checkId: "G19", finding: "Open each section with a direct, one-sentence answer", impact: 3, effort: 2, priority: 4, severity: "low", quickWin: false, requiresApproval: false },
    ],
    summary: {
      markdown:
        "**Northwind Coffee scores 68/100 (grade D)** - a solid technical base with a few high-leverage wins in discoverability and tracking.\n\n- **Strongest: Tech (80).** HTTPS, a mobile viewport and fast responses are all in place.\n- **Biggest opportunity: Tracking (55).** The site loads analytics but has no consent banner and sets no Consent Mode defaults - both a compliance risk and a data-quality problem.\n- **Quick wins:** add Open Graph tags (shared links look broken without them) and an HSTS header - low effort, high impact.\n\nStart with the two high-severity items in the action plan; they move the score furthest for the least work.",
    },
    summaryStatus: "ok",
  },
};

export default function SamplePage() {
  return <ReportView report={SAMPLE} initialSteps={[]} demo />;
}
