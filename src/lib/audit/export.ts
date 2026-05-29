/**
 * LLM-friendly export of a Site IQ audit (issue #12).
 *
 * Serializes a validated `AuditResult` into a clean, structured document that downstream AI systems
 * (AI IDEs, coding assistants, analysis agents) - or a human - can act on directly: overall grade,
 * per-dimension scores, a prioritized action plan joined with the per-check why/fix/example guidance
 * (CHECK_INFO), and which specific pages failed each check (with structured reasons). Two renderings
 * share one model: Markdown (default, human+LLM readable) and JSON (the model verbatim).
 *
 * Pure functions, no React / no I/O, so they unit-test cleanly. `generatedAt` is injected (never read
 * from the clock here) so the output is deterministic and testable; the route passes the request time.
 */
import type {
  AuditResult,
  CheckResult,
  DimensionResult,
  FailedPageReason,
  FailureReason,
} from "./types";
import { CHECK_INFO } from "./checkInfo";

export interface ExportCheck {
  id: string;
  label: string;
  status: "pass" | "partial" | "fail" | "not_applicable";
  ratio: number | null;
  severity: CheckResult["severity"];
  where?: string;
  why?: string;
  fix?: string;
  example?: string;
  failingPages?: { path: string; reason?: string }[];
  moreFailing?: number;
}

export interface ExportDimension {
  id: string;
  label: string;
  score: number | null; // null when not assessed
  rawScore: number | null;
  capped: boolean;
  notApplicable: boolean;
  checks: ExportCheck[];
}

export interface ExportActionItem {
  rank: number;
  checkId: string;
  finding: string;
  severity: CheckResult["severity"];
  impact: number;
  effort: number;
  quickWin: boolean;
  requiresApproval: boolean;
  why?: string;
  fix?: string;
  example?: string;
  affectedPages?: { path: string; reason?: string }[];
}

export interface ExportModel {
  tool: "Site IQ";
  domain: string;
  generatedAt: string;
  overall: number;
  grade: AuditResult["grade"];
  capped: boolean;
  coverage: {
    pagesAudited: string[];
    pagesWithIssues: number | null;
    pagesExcluded: number | null;
    pagesFailed: { path: string; reason: string }[];
  };
  dimensions: ExportDimension[];
  actionPlan: ExportActionItem[];
}

/** Plain-text sentence for why a sampled page failed a check (mirrors the report UI, server-safe). */
export function failureReasonText(r?: FailureReason): string | undefined {
  if (!r) return undefined;
  switch (r.kind) {
    case "too_short":
      return `too short (${r.actual} < ${r.min})`;
    case "too_long":
      return `too long (${r.actual} > ${r.max})`;
    case "missing":
      return `missing ${r.what}`;
    case "noindex":
      return "set to noindex";
    case "http_status":
      return `returned HTTP ${r.code}`;
    case "soft_404":
      return "looks like a soft 404";
    case "non_https":
      return "served over plain HTTP";
    case "wrong_count":
      return `found ${r.actual} ${r.what} (expected ${r.expected})`;
    case "mismatch":
      return `${r.what} mismatch (expected ${r.expected}, got ${r.actual})`;
    case "other":
      return r.note;
    default:
      return undefined;
  }
}

const FAILED_PAGE_REASON_TEXT: Record<FailedPageReason, string> = {
  "4xx": "returned a 4xx error",
  "5xx": "returned a 5xx server error",
  "no-content": "returned no usable content",
  timeout: "timed out / never returned",
};

function checkStatus(ratio: number | null): ExportCheck["status"] {
  if (ratio === null) return "not_applicable";
  if (ratio >= 1) return "pass";
  if (ratio <= 0) return "fail";
  return "partial";
}

function toExportCheck(c: CheckResult): ExportCheck {
  const info = CHECK_INFO[c.id];
  const failing = (c.evidence?.failing ?? []).map((f) => ({
    path: f.path,
    reason: failureReasonText(f.reason),
  }));
  return {
    id: c.id,
    label: c.label,
    status: checkStatus(c.ratio),
    ratio: c.ratio,
    severity: c.severity,
    where: c.evidence?.where,
    why: info?.why,
    fix: info?.fix,
    example: info?.example,
    failingPages: failing.length ? failing : undefined,
    moreFailing: c.evidence?.more || undefined,
  };
}

function toExportDimension(d: DimensionResult): ExportDimension {
  const na = d.notApplicable === true;
  return {
    id: d.id,
    label: d.label,
    score: na ? null : d.score,
    rawScore: na ? null : d.rawScore,
    capped: d.capped === true,
    notApplicable: na,
    checks: d.checks.map(toExportCheck),
  };
}

export function buildExportModel(result: AuditResult, opts: { domain: string; generatedAt: string }): ExportModel {
  // index checks by id so action items can attach their affected pages without re-walking dimensions
  const checkById = new Map<string, CheckResult>();
  for (const d of result.dimensions ?? []) for (const c of d.checks ?? []) checkById.set(c.id, c);

  const actionPlan: ExportActionItem[] = [...(result.actionPlan ?? [])]
    .sort((a, b) => b.priority - a.priority)
    .map((a, i) => {
      const info = CHECK_INFO[a.checkId];
      const failing = (checkById.get(a.checkId)?.evidence?.failing ?? []).map((f) => ({
        path: f.path,
        reason: failureReasonText(f.reason),
      }));
      return {
        rank: i + 1,
        checkId: a.checkId,
        finding: a.finding,
        severity: a.severity,
        impact: a.impact,
        effort: a.effort,
        quickWin: a.quickWin,
        requiresApproval: a.requiresApproval,
        why: info?.why,
        fix: info?.fix,
        example: info?.example,
        affectedPages: failing.length ? failing : undefined,
      };
    });

  return {
    tool: "Site IQ",
    domain: opts.domain,
    generatedAt: opts.generatedAt,
    overall: result.overall,
    grade: result.grade,
    capped: result.capped,
    coverage: {
      pagesAudited: (result.pages ?? []).map((p) => p.path),
      pagesWithIssues: result.pagesWithIssues ?? null,
      pagesExcluded: result.pagesExcluded ?? null,
      pagesFailed: (result.pagesFailed ?? []).map((p) => ({
        path: p.path,
        reason: FAILED_PAGE_REASON_TEXT[p.reason] ?? p.reason,
      })),
    },
    dimensions: (result.dimensions ?? []).map(toExportDimension),
    actionPlan,
  };
}

const STATUS_MARK: Record<ExportCheck["status"], string> = {
  pass: "PASS",
  partial: "PARTIAL",
  fail: "FAIL",
  not_applicable: "N/A",
};

function pagesLine(pages?: { path: string; reason?: string }[]): string {
  if (!pages || !pages.length) return "site-wide";
  return pages.map((p) => (p.reason ? `${p.path} (${p.reason})` : p.path)).join(", ");
}

/** Render the model as LLM-friendly Markdown. */
export function toMarkdown(m: ExportModel): string {
  const L: string[] = [];
  L.push(`# Site IQ audit - ${m.domain}`, "");
  L.push(`- Overall score: ${m.overall}/100 (grade ${m.grade})${m.capped ? " - capped by a critical failure" : ""}`);
  L.push(`- Generated: ${m.generatedAt}`);
  const cov = m.coverage;
  const covBits = [`${cov.pagesAudited.length} pages audited`];
  if (cov.pagesWithIssues != null) covBits.push(`${cov.pagesWithIssues} with issues`);
  if (cov.pagesExcluded) covBits.push(`${cov.pagesExcluded} excluded (sensitive-path filter)`);
  if (cov.pagesFailed.length) covBits.push(`${cov.pagesFailed.length} could not be crawled`);
  L.push(`- Coverage: ${covBits.join(", ")}`, "");

  L.push(`## Scores by dimension`, "");
  L.push(`| Dimension | Score |`, `| --- | --- |`);
  for (const d of m.dimensions) {
    L.push(`| ${d.label} | ${d.notApplicable ? "Not assessed" : `${d.score}/100`}${d.capped ? " (capped)" : ""} |`);
  }
  L.push("");

  L.push(`## Prioritized action plan`, "");
  if (!m.actionPlan.length) {
    L.push("No issues found - every applicable check passed.", "");
  } else {
    for (const a of m.actionPlan) {
      const tags = [
        a.severity,
        `impact ${a.impact}/5`,
        `effort ${a.effort}/5`,
        ...(a.quickWin ? ["quick win"] : []),
        ...(a.requiresApproval ? ["needs sign-off"] : []),
      ].join(", ");
      L.push(`### ${a.rank}. ${a.finding}  [${a.checkId}: ${tags}]`);
      if (a.why) L.push(`- Why it matters: ${a.why}`);
      if (a.fix) L.push(`- How to fix: ${a.fix}`);
      if (a.example) L.push(`- Example: \`${a.example}\``);
      L.push(`- Affected pages: ${pagesLine(a.affectedPages)}`);
      L.push("");
    }
  }

  L.push(`## Full check results`, "");
  for (const d of m.dimensions) {
    L.push(`### ${d.label}${d.notApplicable ? " - Not assessed" : ` - ${d.score}/100`}`);
    for (const c of d.checks) {
      let line = `- [${STATUS_MARK[c.status]}] ${c.id} ${c.label}`;
      if (c.status === "fail" || c.status === "partial") {
        const fp = pagesLine(c.failingPages);
        if (fp !== "site-wide") line += ` - failing: ${fp}${c.moreFailing ? ` (+${c.moreFailing} more)` : ""}`;
        else if (c.where) line += ` - ${c.where}`;
      }
      L.push(line);
    }
    L.push("");
  }

  if (m.coverage.pagesAudited.length || m.coverage.pagesFailed.length) {
    L.push(`## Crawl coverage`, "");
    if (m.coverage.pagesAudited.length) L.push(`- Audited: ${m.coverage.pagesAudited.join(", ")}`);
    if (m.coverage.pagesExcluded) L.push(`- Excluded (sensitive-path filter): ${m.coverage.pagesExcluded}`);
    for (const p of m.coverage.pagesFailed) L.push(`- Could not crawl ${p.path}: ${p.reason}`);
    L.push("");
  }

  return L.join("\n").trimEnd() + "\n";
}

/** Render the model as pretty JSON (the model verbatim). */
export function toJson(m: ExportModel): string {
  return JSON.stringify(m, null, 2);
}
