"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Catches errors thrown in the root layout/template (which app/error.tsx cannot). Must render its
 * own <html>/<body>. Reports to Sentry so a top-level crash is actually captured, not just logged.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          global-error renders its own <html> OUTSIDE the next-themes provider, so the
          theme class is not applied for us here. Re-derive it before paint (same logic
          next-themes uses: stored choice, else OS preference) so the error page matches
          the user's theme instead of being locked to dark. Inline + pre-hydration to
          avoid a flash on this fallback page.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('siteiq-theme');var d=t==='dark'||((t===null||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We hit an unexpected error and have logged it. Please try again.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </body>
    </html>
  );
}
