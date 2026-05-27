/**
 * Documentation viewer loading component
 * Skeleton for markdown documentation display
 */
export default function DocsLoading() {
    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
                {/* Sidebar skeleton */}
                <div className="lg:col-span-1">
                    <div className="sticky top-8 rounded-lg border border-border bg-card p-4">
                        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                        <div className="mt-4 space-y-2">
                            {[...Array(8)].map((_, i) => (
                                <div
                                    key={i}
                                    className="h-8 w-full animate-pulse rounded bg-muted"
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Content skeleton */}
                <div className="lg:col-span-3">
                    <div className="rounded-lg border border-border bg-card p-8">
                        {/* Title */}
                        <div className="h-10 w-3/4 animate-pulse rounded bg-muted" />

                        {/* Intro paragraph */}
                        <div className="mt-6 space-y-2">
                            <div className="h-4 w-full animate-pulse rounded bg-muted" />
                            <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
                        </div>

                        {/* Section */}
                        <div className="mt-8">
                            <div className="h-7 w-48 animate-pulse rounded bg-muted" />
                            <div className="mt-4 space-y-2">
                                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                            </div>
                        </div>

                        {/* Code block skeleton */}
                        <div className="mt-6 rounded-md bg-zinc-900 p-4">
                            <div className="space-y-2">
                                <div className="h-4 w-48 animate-pulse rounded bg-zinc-700" />
                                <div className="h-4 w-64 animate-pulse rounded bg-zinc-700" />
                                <div className="h-4 w-40 animate-pulse rounded bg-zinc-700" />
                            </div>
                        </div>

                        {/* Another section */}
                        <div className="mt-8">
                            <div className="h-7 w-36 animate-pulse rounded bg-muted" />
                            <div className="mt-4 space-y-2">
                                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                                <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                            </div>
                        </div>

                        {/* List skeleton */}
                        <div className="mt-4 space-y-2 pl-4">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="h-2 w-2 animate-pulse rounded-full bg-muted" />
                                    <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
