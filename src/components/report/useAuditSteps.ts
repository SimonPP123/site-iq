"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AuditStep = {
  id: number;
  report_id: string;
  step: string;
  status: "running" | "done" | "error";
  progress: number;
  detail: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Live audit progress. Subscribes to INSERT + UPDATE on `audit_steps` for one report.
 * RLS scopes which rows reach the client; the filter is just for efficiency.
 * Seed `initial` from a server snapshot so a refresh restores state.
 */
export function useAuditSteps(reportId: string, initial: AuditStep[] = []) {
  const [steps, setSteps] = useState<AuditStep[]>(initial);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`audit_steps:${reportId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_steps", filter: `report_id=eq.${reportId}` },
        (payload) => setSteps((prev) => [...prev, payload.new as AuditStep]),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "audit_steps", filter: `report_id=eq.${reportId}` },
        (payload) => {
          const row = payload.new as AuditStep;
          setSteps((prev) => prev.map((s) => (s.id === row.id ? row : s)));
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[audit_steps] realtime channel ${status} for ${reportId}`);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reportId]);

  return steps;
}
