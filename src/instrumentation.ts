import * as Sentry from "@sentry/nextjs";

/**
 * Next.js runs this once per server process before any request. We (1) validate env at boot so a
 * misconfigured deploy fails fast rather than at first request, and (2) initialize Sentry for the
 * active runtime. Sentry.init with an undefined DSN is a safe no-op, so this is harmless without a
 * DSN and fully functional with one.
 */
export async function register() {
  await import("@/lib/env"); // boot-time env validation (throws in production on invalid)

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Captures errors thrown in Server Components, route handlers, and middleware (Next 15+/16 hook).
export const onRequestError = Sentry.captureRequestError;
