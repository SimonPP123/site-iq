/**
 * Secrets viewer loading component
 * Skeleton for environment variables display
 */
export default function SecretsLoading() {
    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="mb-8">
                <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
                <div className="mt-2 h-4 w-80 animate-pulse rounded-md bg-muted" />
            </div>

            {/* Warning banner skeleton */}
            <div className="mb-6 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                <div className="flex gap-3">
                    <div className="h-5 w-5 animate-pulse rounded bg-yellow-500/30" />
                    <div className="flex-1">
                        <div className="h-4 w-48 animate-pulse rounded bg-yellow-500/30" />
                        <div className="mt-1 h-3 w-64 animate-pulse rounded bg-yellow-500/20" />
                    </div>
                </div>
            </div>

            {/* Secrets groups */}
            <div className="space-y-6">
                {[...Array(3)].map((_, groupIndex) => (
                    <div
                        key={groupIndex}
                        className="rounded-lg border border-border bg-card"
                    >
                        {/* Group header */}
                        <div className="border-b border-border px-6 py-4">
                            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                        </div>
                        {/* Secret items */}
                        {[...Array(4)].map((_, i) => (
                            <div
                                key={i}
                                className="border-b border-border px-6 py-3 last:border-0"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                                        <div className="h-4 w-48 animate-pulse rounded bg-muted font-mono" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="h-6 w-16 animate-pulse rounded-full bg-green-500/20" />
                                        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            {/* Env-source link */}
            <div className="mt-8 flex items-center justify-center gap-2">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-4 w-4 animate-pulse rounded bg-muted" />
            </div>
        </div>
    );
}
