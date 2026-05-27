/**
 * Login page loading skeleton.
 * Mirrors the real form layout: brand link + h1 + subtitle, then email input,
 * password input, submit button, forgot-password link, and sign-up link.
 * No divider or social buttons - the real login page has none.
 */
export default function LoginLoading() {
    return (
        <main className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="surface p-8">
                    {/* Brand + heading */}
                    <div className="mb-8 text-center">
                        <div className="mx-auto h-5 w-16 animate-pulse rounded bg-muted" />
                        <div className="mx-auto mt-4 h-8 w-44 animate-pulse rounded bg-muted" />
                        <div className="mx-auto mt-2 h-4 w-40 animate-pulse rounded bg-muted" />
                    </div>

                    {/* Form fields */}
                    <div className="space-y-6">
                        {/* Email */}
                        <div>
                            <div className="mb-2 h-4 w-12 animate-pulse rounded bg-muted" />
                            <div className="h-12 w-full animate-pulse rounded-lg bg-muted" />
                        </div>
                        {/* Password */}
                        <div>
                            <div className="mb-2 h-4 w-20 animate-pulse rounded bg-muted" />
                            <div className="h-12 w-full animate-pulse rounded-lg bg-muted" />
                        </div>
                        {/* Submit */}
                        <div className="h-12 w-full animate-pulse rounded-lg bg-primary/20" />
                    </div>

                    {/* Forgot password + sign-up links */}
                    <div className="mt-6 flex justify-center">
                        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="mt-2 flex justify-center">
                        <div className="h-4 w-44 animate-pulse rounded bg-muted" />
                    </div>
                </div>

                {/* Footer note */}
                <div className="mt-6 flex justify-center">
                    <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                </div>
            </div>
        </main>
    );
}
