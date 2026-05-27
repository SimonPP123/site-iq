/**
 * Users management loading component
 * Skeleton for user table
 */
export default function UsersLoading() {
    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
                    <div className="mt-2 h-4 w-48 animate-pulse rounded-md bg-muted" />
                </div>
                <div className="h-10 w-32 animate-pulse rounded-md bg-primary/20" />
            </div>

            {/* Search and filters */}
            <div className="mb-6 flex gap-4">
                <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
                <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
            </div>

            {/* Table skeleton */}
            <div className="rounded-lg border border-border bg-card">
                {/* Table header */}
                <div className="border-b border-border px-6 py-3">
                    <div className="grid grid-cols-5 gap-4">
                        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                    </div>
                </div>
                {/* Table rows */}
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        className="border-b border-border px-6 py-4 last:border-0"
                    >
                        <div className="grid grid-cols-5 gap-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                            </div>
                            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                            <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
                            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                            <div className="h-8 w-20 animate-pulse rounded bg-muted" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Pagination skeleton */}
            <div className="mt-4 flex items-center justify-between">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="flex gap-2">
                    <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                    <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                    <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                </div>
            </div>
        </div>
    );
}
