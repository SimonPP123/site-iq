"use client";

import Link from "next/link";
import { useState } from "react";
// SSR browser client (@supabase/ssr) - stores the session in COOKIES so the server (proxy, API
// routes, server components) sees it. The plain @supabase/supabase-js client uses localStorage,
// which the server can't read, so a "successful" sign-up would still 401 every server request.
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT, validatePassword } from "@/lib/password";
import { isPwnedPassword } from "@/lib/hibp";
import { authErrorMessage } from "@/lib/auth-errors";

function SignupForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
    const [errorMessage, setErrorMessage] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage("");

        const passwordError = validatePassword(password);
        if (passwordError) {
            setErrorMessage(passwordError);
            setStatus("error");
            return;
        }

        if (password !== confirmPassword) {
            setErrorMessage("Passwords do not match");
            setStatus("error");
            return;
        }

        setStatus("loading");

        // Reject passwords found in known breaches (HaveIBeenPwned k-anonymity; the password never
        // leaves the browser). Fail-open, so an HIBP outage can never block signup.
        if (await isPwnedPassword(password)) {
            setErrorMessage("This password has appeared in a known data breach - please choose a different one.");
            setStatus("error");
            return;
        }

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) {
                setErrorMessage(authErrorMessage(error));
                setStatus("error");
                return;
            }

            setStatus("success");
        } catch {
            setErrorMessage("An unexpected error occurred");
            setStatus("error");
        }
    };

    if (status === "success") {
        return (
            <div
                role="status"
                aria-live="polite"
                className="rounded-lg border border-accent/30 bg-accent/10 p-4 text-center"
            >
                <p className="text-sm font-medium text-foreground">
                    Check your inbox to confirm your email, then sign in.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                    We have sent a confirmation link to{" "}
                    <span className="font-medium text-foreground">{email}</span>.
                </p>
                <Link
                    href="/login"
                    className="mt-4 inline-block text-sm font-medium accent-text hover:underline"
                >
                    Go to sign in
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium text-foreground"
                >
                    Email
                </label>
                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full rounded-lg border border-border bg-background/50 px-4 py-3 text-foreground placeholder:text-muted-foreground/60 transition-colors"
                    placeholder="you@example.com"
                />
            </div>

            <div>
                <label
                    htmlFor="password"
                    className="mb-2 block text-sm font-medium text-foreground"
                >
                    Password
                </label>
                <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                    aria-describedby="password-hint"
                    className="w-full rounded-lg border border-border bg-background/50 px-4 py-3 text-foreground placeholder:text-muted-foreground/60 transition-colors"
                    placeholder="••••••••"
                />
                <p id="password-hint" className="mt-2 text-sm text-muted-foreground">
                    {PASSWORD_HINT}
                </p>
            </div>

            <div>
                <label
                    htmlFor="confirm-password"
                    className="mb-2 block text-sm font-medium text-foreground"
                >
                    Confirm password
                </label>
                <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-border bg-background/50 px-4 py-3 text-foreground placeholder:text-muted-foreground/60 transition-colors"
                    placeholder="••••••••"
                />
            </div>

            {status === "error" && (
                <div
                    role="alert"
                    aria-live="assertive"
                    className="rounded-lg border border-red-500/30 bg-red-500/10 p-3"
                >
                    <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
                </div>
            )}

            <button
                type="submit"
                disabled={status === "loading"}
                aria-busy={status === "loading"}
                className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {status === "loading" ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg
                            className="h-5 w-5 animate-spin"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                            />
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                        </svg>
                        <span>Creating account...</span>
                        <span className="sr-only">Please wait while we create your account</span>
                    </span>
                ) : (
                    "Create account"
                )}
            </button>
        </form>
    );
}

export default function SignupPage() {
    return (
        <main id="main-content" className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="surface p-8">
                    <div className="mb-8 text-center">
                        <Link href="/" className="text-lg font-semibold accent-text">Site IQ</Link>
                        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
                            Create your account
                        </h1>
                        <p className="mt-2 text-muted-foreground">
                            Create a free account to run audits and save your reports.
                        </p>
                    </div>

                    <SignupForm />

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Already have an account?{" "}
                        <Link href="/login" className="font-medium accent-text hover:underline">
                            Sign in
                        </Link>
                    </p>
                </div>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                    Secured with industry-standard authentication
                </p>
            </div>
        </main>
    );
}
