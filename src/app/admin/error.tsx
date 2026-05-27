"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Admin error:", error);
    }, [error]);

    return (
        <div className="flex items-center justify-center min-h-[60vh] p-8">
            {/* Plain <div> (was motion.div). The mount fade/scale-in pulled
                framer-motion into this route for a cosmetic entrance; the sibling
                src/app/error.tsx renders this card statically, so we match it. */}
            <div className="text-center max-w-md bg-card rounded-xl border border-border p-8 shadow-lg">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <svg
                        className="w-8 h-8 text-red-600 dark:text-red-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                </div>

                <h2 className="text-xl font-semibold text-foreground mb-2">
                    Admin Panel Error
                </h2>

                <p className="text-muted-foreground mb-6 text-sm">
                    {error.message || "An error occurred in the admin panel"}
                </p>

                <div className="flex gap-3 justify-center">
                    <Button size="sm" onClick={reset}>
                        Retry
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => (window.location.href = "/admin")}
                    >
                        Dashboard
                    </Button>
                </div>
            </div>
        </div>
    );
}
