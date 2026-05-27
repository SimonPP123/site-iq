/**
 * Root loading component - displayed during page transitions.
 * Matches the Site IQ dark system; the spinner accent uses the design-system accent colour.
 */
export default function Loading() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <div className="relative">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-border border-t-accent" />
                </div>
                <p className="animate-pulse text-sm text-muted-foreground">Loading...</p>
            </div>
        </div>
    );
}
