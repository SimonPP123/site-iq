"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Self-serve GDPR controls on the account page: export the caller's data (a downloadable JSON from
 * /api/account/export) and permanently delete the account + all its data (/api/account/delete, with
 * a two-step confirm). On delete we sign out locally and return home.
 */
export function DataControls() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deleteAccount() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error || "Could not delete your account");
      }
      await createClient().auth.signOut();
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete your account");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {/* A link (not fetch) so the browser handles the Content-Disposition download with cookies. */}
        <a
          href="/api/account/export"
          className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/60"
        >
          Export my data (JSON)
        </a>
        {!confirming && (
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
              setError("");
            }}
            className="inline-flex items-center justify-center rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
          >
            Delete my account
          </button>
        )}
      </div>

      {confirming && (
        <div role="alertdialog" aria-label="Confirm account deletion" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm font-medium text-foreground">Permanently delete your account and all your data?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This erases your reports, their crawled pages, chat history and usage. It cannot be undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={deleteAccount}
              disabled={busy}
              aria-busy={busy}
              className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Deleting..." : "Yes, delete everything"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
