import { requireAdmin } from "@/lib/admin-guard";

export default async function UsersPage() {
    await requireAdmin();
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
                <button
                    type="button"
                    disabled
                    title="Coming soon"
                    aria-disabled="true"
                    className="cursor-not-allowed rounded-md bg-black px-4 py-2 text-sm font-medium text-white opacity-50 dark:bg-white dark:text-black"
                >
                    Invite User
                </button>
            </div>

            <div className="rounded-xl border bg-white shadow-sm dark:bg-neutral-950 dark:border-neutral-800">
                <div className="p-12 text-center">
                    <h3 className="mt-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">No users to show here yet</h3>
                    <p className="mt-1 text-sm text-neutral-500">
                        In-app user management is on the way. For now, manage users from the Supabase
                        Auth dashboard.
                    </p>
                </div>
            </div>
        </div>
    );
}
