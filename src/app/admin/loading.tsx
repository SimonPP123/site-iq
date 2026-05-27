/**
 * Admin dashboard loading component
 * Skeleton UI for better perceived performance
 */
export default function AdminLoading() {
    return (
        <div className="min-h-screen bg-background">
            {/* Header skeleton */}
            <header className="border-b border-border bg-card">
                <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
                        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {/* Page title skeleton */}
                <div className="mb-8">
                    <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
                    <div className="mt-2 h-4 w-96 animate-pulse rounded-md bg-muted" />
                </div>

                {/* Stats grid skeleton */}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <div
                            key={i}
                            className="rounded-lg border border-border bg-card p-6"
                        >
                            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-muted" />
                        </div>
                    ))}
                </div>

                {/* Content skeleton */}
                <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {[...Array(2)].map((_, i) => (
                        <div
                            key={i}
                            className="rounded-lg border border-border bg-card p-6"
                        >
                            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
                            <div className="mt-4 space-y-3">
                                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
