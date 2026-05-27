"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

const GRADE_HEX: Record<string, string> = { A: "#10b981", B: "#34d399", C: "#f59e0b", D: "#fb923c", F: "#ef4444" };
const gradeFor = (s: number | null) =>
  s === null ? "?" : s >= 90 ? "A" : s >= 80 ? "B" : s >= 70 ? "C" : s >= 60 ? "D" : "F";

export type AuditRow = { id: string; domain: string; status: string; score_overall: number | null; created_at: string };

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function AuditsList({ initial }: { initial: AuditRow[] }) {
  const [rows, setRows] = useState<AuditRow[]>(initial);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Ids pending deletion, shown in an in-app confirm dialog. Replaces window.confirm(), which is
  // unreliable/auto-dismissed inside mobile in-app browsers (Gmail/LinkedIn/Slack webviews).
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // The element focused before the dialog opened, so focus can be restored to it on close (a11y).
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Modal focus management while the delete-confirm dialog is open: Escape closes it, Tab is trapped
  // inside the dialog, the first control is focused on open, and focus returns to the trigger on close.
  // Kept in-house (no focus-trap dependency) - the dialog has few focusable controls.
  useEffect(() => {
    if (!confirmIds) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    // Focus the first control once the dialog has mounted.
    focusable()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!busy) setConfirmIds(null);
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // Wrap focus at the edges, and pull focus back in if it ever escaped the dialog.
      if (e.shiftKey) {
        if (active === first || !dialogRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialogRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [confirmIds, busy]);

  const allSelected = rows.length > 0 && sel.size === rows.length;
  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  async function performDelete() {
    const ids = confirmIds;
    if (!ids || ids.length === 0 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/reports/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Delete failed");
      const gone = new Set(ids);
      setRows((rs) => rs.filter((r) => !gone.has(r.id)));
      setSel((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
      setConfirmIds(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
      setConfirmIds(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-6 flex min-h-11 items-center justify-between gap-3">
        <label className="-m-2 flex min-h-11 cursor-pointer items-center gap-2 p-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            disabled={rows.length === 0}
            className="h-5 w-5 accent-[#7c6cff]"
          />
          {sel.size > 0 ? `${sel.size} selected` : "Select all"}
        </label>
        {sel.size > 0 && (
          <button
            onClick={() => setConfirmIds([...sel])}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 text-sm font-medium text-red-700 transition hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
          >
            <TrashIcon /> Delete {sel.size}
          </button>
        )}
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}

      <ul className="mt-3 space-y-2">
        {rows.map((r) => {
          const g = gradeFor(r.score_overall);
          const c = GRADE_HEX[g] ?? "#9a9aa7";
          return (
            <li key={r.id} className={`surface flex items-center gap-2 p-3 transition sm:gap-3 sm:p-4 ${sel.has(r.id) ? "border-accent/60" : ""}`}>
              <label className="-m-1 flex min-h-11 min-w-11 cursor-pointer items-center justify-center p-1" aria-label={`Select ${r.domain}`}>
                <input
                  type="checkbox"
                  checked={sel.has(r.id)}
                  onChange={() => toggle(r.id)}
                  className="h-5 w-5 accent-[#7c6cff]"
                />
              </label>
              <Link href={`/audit/${r.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.domain}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>
                </div>
                {r.status === "done" ? (
                  <span
                    className="shrink-0 rounded-full border px-3 py-1 text-sm font-medium tabular-nums"
                    style={{ borderColor: `${c}55`, backgroundColor: `${c}1a`, color: c }}
                  >
                    {r.score_overall} · {g}
                  </span>
                ) : (
                  <span className={`shrink-0 text-xs uppercase tracking-wide ${r.status === "error" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                    {r.status === "error" ? "failed" : "running…"}
                  </span>
                )}
              </Link>
              <button
                onClick={() => setConfirmIds([r.id])}
                disabled={busy}
                aria-label={`Delete ${r.domain}`}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
              >
                <TrashIcon />
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="surface flex flex-col items-center gap-3 p-10 text-center">
            <Image src="/empty-audits.png" alt="" width={160} height={160} className="h-32 w-32 select-none opacity-90" />
            <p className="text-sm text-muted-foreground">
              No audits here yet. <Link href="/" className="text-accent">Start an audit →</Link>
            </p>
          </li>
        )}
      </ul>

      {confirmIds && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !busy && setConfirmIds(null)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="del-title"
            className="surface w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="del-title" className="text-lg font-semibold text-foreground">
              Delete {confirmIds.length} audit{confirmIds.length === 1 ? "" : "s"}?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This also removes their chat history and can&apos;t be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmIds(null)}
                disabled={busy}
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition hover:bg-accent/40 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={performDelete}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 text-sm font-medium text-red-700 transition hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
