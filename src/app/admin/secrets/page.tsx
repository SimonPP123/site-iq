import { requireAdmin } from "@/lib/admin-guard";

export default async function SecretsPage() {
    await requireAdmin();
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Secrets Manager</h2>
                <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-300">
                        Vercel Environment
                    </span>
                </div>
            </div>

            <div className="rounded-xl border bg-white shadow-sm dark:bg-neutral-950 dark:border-neutral-800">
                <div className="p-6">
                    <p className="text-sm text-neutral-500 mb-4">
                        Secrets are supplied as environment variables from the Vercel project (and
                        <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">.env.local</code>
                        in local development). The list below is illustrative - manage the real
                        values in the Vercel dashboard.
                    </p>

                    <div className="space-y-4">
                        {["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "RESEND_API_KEY", "SENTRY_DSN"].map((key) => (
                            <div key={key} className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-4 last:border-0 last:pb-0">
                                <div className="font-mono text-sm font-medium">{key}</div>
                                <div className="font-mono text-sm text-neutral-400">************************</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
