import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReportView, type Report } from "@/components/report/ReportView";
import { normalizeReport } from "@/components/report/normalize";
import type { AuditStep } from "@/components/report/useAuditSteps";

export const dynamic = "force-dynamic";

// A report page is per-user, gated content - keep it out of search indexes.
// generateMetadata supersedes the static `metadata` export; robots noindex is
// preserved on every report so these never appear in search results.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { robots: { index: false, follow: false } };

  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("domain")
    .eq("id", id)
    .single();

  return {
    title: data?.domain ?? "Audit report",
    robots: { index: false, follow: false },
  };
}

// Match the canonical UUID shape Postgres expects. A malformed id can never identify a real report,
// so reject it up front (404) instead of issuing a query that would only error or return nothing.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();

  const { data: report } = await supabase
    .from("reports")
    .select("id, domain, status, score_overall, result, error")
    .eq("id", id)
    .single();

  if (!report) notFound();

  const { data: steps } = await supabase
    .from("audit_steps")
    .select("id, report_id, step, status, progress, detail, created_at")
    .eq("report_id", id)
    .order("id");

  return <ReportView report={normalizeReport(report as Report)} initialSteps={(steps ?? []) as AuditStep[]} />;
}
