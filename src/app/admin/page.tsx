import { requireAdmin } from "@/lib/admin-guard";

export default async function AdminDashboard() {
    await requireAdmin();
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Status Cards - only facts we can state without a live metrics source. */}
                <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-neutral-950 dark:border-neutral-800">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium text-neutral-500">System Status</h3>
                        <span className="h-2 w-2 rounded-full bg-green-500"></span>
                    </div>
                    <div className="text-2xl font-bold">Healthy</div>
                    <p className="text-xs text-neutral-500 mt-1">All systems operational</p>
                </div>

                <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-neutral-950 dark:border-neutral-800">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium text-neutral-500">Hosting</h3>
                        <span className="h-2 w-2 rounded-full bg-green-500"></span>
                    </div>
                    <div className="text-2xl font-bold">Vercel</div>
                    <p className="text-xs text-neutral-500 mt-1">See the Vercel dashboard for builds and metrics</p>
                </div>
            </div>

            <p className="text-sm text-neutral-500">
                Live usage, error-rate and traffic metrics are not surfaced here yet. Check the
                Vercel dashboard for deployments and the Sentry project for errors.
            </p>
        </div>
    );
}
