import type { Report } from "./ReportView";
import { parseAuditResult } from "@/lib/audit/contract";

/**
 * Validate + normalize the `result` payload that n8n wrote to Supabase. Supabase can hand the jsonb
 * back as a JSON *string* (a value stored via JSON.stringify is double-encoded), so parseAuditResult
 * accepts both a string and an already-parsed object, validates the shape the UI depends on, and
 * returns null for a malformed payload - the report view then degrades gracefully instead of
 * crashing on result.dimensions.map(...). Lives in a non-"use client" module so both the server
 * report page and the client ReportView can call it.
 */
export function normalizeReport(r: Report): Report {
  const raw = (r as { result: unknown }).result;
  if (raw === null || raw === undefined) return r;
  return { ...r, result: parseAuditResult(raw) as Report["result"] };
}
