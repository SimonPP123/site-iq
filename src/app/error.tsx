"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const router = useRouter();

    useEffect(() => {
        // Report to Sentry and keep a console trace for local debugging.
        Sentry.captureException(error);
        console.error("Application error:", error);
    }, [error]);

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="max-w-md text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
                    <svg
                        className="h-10 w-10 text-red-600 dark:text-red-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                    </svg>
                </div>

                <h1 className="mb-3 text-2xl font-bold tracking-tight text-foreground">
                    Something went wrong
                </h1>

                <p className="mb-8 text-muted-foreground">
                    We encountered an unexpected error. We&apos;ve logged the error and will look
                    into it.
                </p>

                <div className="flex justify-center gap-4">
                    <button
                        onClick={reset}
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
                    >
                        Try Again
                    </button>
                    <button
                        onClick={() => router.push("/")}
                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/60"
                    >
                        Go Home
                    </button>
                </div>

                {error.digest && (
                    <p className="mt-6 text-xs text-muted-foreground">
                        Error ID: {error.digest}
                    </p>
                )}
            </div>
        </div>
    );
}
