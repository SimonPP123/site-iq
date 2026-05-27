"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT, validatePassword } from "@/lib/password";
import { isPwnedPassword } from "@/lib/hibp";

/**
 * Set a new password after following the reset link. The /api/auth/callback exchanges the recovery
 * code into a session and redirects here; we then call updateUser({ password }). If there is no
 * recovery session (direct visit / expired link) we say so and point back to /forgot-password.
 */
export default function ResetPasswordPage() {
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setReady(data.user ? "ok" : "invalid"));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const passwordError = validatePassword(password);
    if (passwordError) return setError(passwordError);
    if (password !== confirm) return setError("Passwords do not match.");
    setStatus("saving");
    setError(null);
    // Reject breached passwords (HIBP k-anonymity, fail-open) - same check as signup.
    if (await isPwnedPassword(password)) {
      setError("This password has appeared in a known data breach - please choose a different one.");
      setStatus("idle");
      return;
    }
    const { error: updErr } = await createClient().auth.updateUser({ password });
    if (updErr) {
      setError(updErr.message);
      setStatus("idle");
      return;
    }
    setStatus("done");
    setTimeout(() => {
      router.push("/audits");
      router.refresh();
    }, 1400);
  }

  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center text-sm font-semibold accent-text">Site IQ</Link>

        {ready === "checking" ? (
          <p className="mt-8 text-center text-sm text-muted-foreground">Checking your reset link…</p>
        ) : ready === "invalid" ? (
          <div className="surface mt-8 p-6 text-center">
            <h1 className="text-lg font-semibold text-foreground">Reset link invalid or expired</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This password-reset link is no longer valid. Request a fresh one and try again.
            </p>
            <Link
              href="/forgot-password"
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
            >
              Request a new link
            </Link>
          </div>
        ) : status === "done" ? (
          <div className="surface mt-8 p-6 text-center">
            <h1 className="text-lg font-semibold text-foreground">Password updated</h1>
            <p className="mt-2 text-sm text-muted-foreground">Taking you to your audits…</p>
          </div>
        ) : (
          <>
            <h1 className="mt-8 text-center text-xl font-semibold tracking-tight">Set a new password</h1>
            <form onSubmit={onSubmit} className="surface mt-6 space-y-4 p-6">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground">New password</label>
                <input
                  id="password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-card/70 px-3 py-2.5 text-sm transition focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <p className="mt-1 text-xs text-muted-foreground">{PASSWORD_HINT}</p>
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-foreground">Confirm password</label>
                <input
                  id="confirm" type="password" required autoComplete="new-password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-card/70 px-3 py-2.5 text-sm transition focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
              <button
                type="submit" disabled={status === "saving"}
                className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {status === "saving" ? "Saving…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
