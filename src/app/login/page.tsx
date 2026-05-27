"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { validateRedirect } from "@/lib/redirect";
// SSR browser client (@supabase/ssr) - stores the session in COOKIES so the server (proxy, API
// routes, server components) sees it. The plain @supabase/supabase-js client uses localStorage,
// which the server can't read, so a "successful" login would still 401 every server request.
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";

function LoginForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const router = useRouter();
    const searchParams = useSearchParams();
    // Site IQ users land on "/" (or their report via ?redirect=/audit/<id>); "/admin" is the
    // shared helper's default for the foundation, so pass "/" explicitly here.
    const redirect = validateRedirect(searchParams.get("redirect"), "/");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus("loading");
        setErrorMessage("");

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                setErrorMessage(authErrorMessage(error));
                setStatus("error");
                return;
            }

            router.push(redirect);
            router.refresh();
        } catch {
            setErrorMessage("An unexpected error occurred");
            setStatus("error");
        }
    };

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
                    className="w-full rounded-lg border border-border bg-background/50 px-4 py-3 text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
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
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-border bg-background/50 px-4 py-3 text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
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
                        <span>Signing in...</span>
                        <span className="sr-only">Please wait while we sign you in</span>
                    </span>
                ) : (
                    "Sign in"
                )}
            </button>
        </form>
    );
}

function LoginFormFallback() {
    return (
        <div className="space-y-6 animate-pulse">
            <div>
                <div className="mb-2 h-4 w-16 rounded bg-muted" />
                <div className="h-12 rounded-lg bg-muted" />
            </div>
            <div>
                <div className="mb-2 h-4 w-20 rounded bg-muted" />
                <div className="h-12 rounded-lg bg-muted" />
            </div>
            <div className="h-12 rounded-lg bg-muted" />
        </div>
    );
}

export default function LoginPage() {
    return (
        <main id="main-content" className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="surface p-8">
                    <div className="mb-8 text-center">
                        <Link href="/" className="text-lg font-semibold accent-text">Site IQ</Link>
                        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
                            Welcome back
                        </h1>
                        <p className="mt-2 text-muted-foreground">
                            Sign in to run website audits
                        </p>
                    </div>

                    <Suspense fallback={<LoginFormFallback />}>
                        <LoginForm />
                    </Suspense>

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        <Link
                            href="/forgot-password"
                            className="font-medium accent-text hover:underline"
                        >
                            Forgot password?
                        </Link>
                    </p>
                    <p className="mt-2 text-center text-sm text-muted-foreground">
                        New to Site IQ?{" "}
                        <Link
                            href="/signup"
                            className="font-medium accent-text hover:underline"
                        >
                            Create an account
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
