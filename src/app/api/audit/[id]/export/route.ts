import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import { parseAuditResult } from "@/lib/audit/contract";
import { buildExportModel, toMarkdown, toJson } from "@/lib/audit/export";

export const runtime = "nodejs";

/**
 * GET /api/audit/[id]/export?format=md|json - download the caller's own audit as an LLM-friendly
 * Markdown (default) or JSON file (issue #12). Read under the user session + RLS, so it can only ever
 * return a report the caller owns; no service role. It is a GET download (a link/navigation, no custom
 * headers), so no CSRF same-origin guard is needed - RLS + auth are the boundary.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "site";
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = String(claims.claims.sub ?? "");

  const rl = await rateLimit(`audit-export:${userId}`, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: getRateLimitHeaders(rl) },
    );
  }

  // RLS scopes this to the caller's own reports.
  const { data: report } = await supabase
    .from("reports")
    .select("domain, status, result")
    .eq("id", id)
    .single();

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (report.status !== "done" || !report.result) {
    return NextResponse.json({ error: "This report is not ready to export yet." }, { status: 409 });
  }

  const parsed = parseAuditResult(report.result);
  if (!parsed) {
    return NextResponse.json({ error: "This report could not be exported." }, { status: 422 });
  }

  const model = buildExportModel(parsed, { domain: report.domain, generatedAt: new Date().toISOString() });
  const wantsJson = new URL(req.url).searchParams.get("format") === "json";
  const base = `site-iq-${slug(report.domain)}`;

  if (wantsJson) {
    return new NextResponse(toJson(model), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${base}.json"`,
      },
    });
  }
  return new NextResponse(toMarkdown(model), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${base}.md"`,
    },
  });
}
