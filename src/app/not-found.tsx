import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <span className="text-sm font-semibold tracking-wider accent-text">404</span>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">This page does not exist</h1>
        <p className="mt-4 max-w-md text-balance text-muted-foreground">
          The page you are looking for moved or never existed. Let us get you back on track.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
          >
            Back to home
          </Link>
          <Link
            href="/methodology"
            className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-accent/60"
          >
            What we check
          </Link>
        </div>
      </main>
    </div>
  );
}
