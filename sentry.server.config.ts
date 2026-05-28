import * as Sentry from "@sentry/nextjs";
import type { Event, EventHint } from "@sentry/nextjs";
import { scrubAuditPaths, scrubBreadcrumb } from "@/lib/sentryScrub";

/**
 * Strip PII from server-side Sentry events before they leave the process.
 * User-submitted domains and auth token fragments can appear in request URLs,
 * query strings, cookies, and POST bodies - none of which belong in error reports.
 * Composes the request-level scrubber with the audit-paths scrubber (shared with the client
 * runtime via src/lib/sentryScrub.ts) so the crawled-site path leakage is closed on both surfaces.
 */
function scrubServerEvent<T extends Event>(event: T, hint: EventHint): T {
  if (event.request) {
    // Remove cookies entirely - they carry session tokens.
    delete event.request.cookies;
    // Remove the raw request body - may contain user-submitted domain or credentials.
    delete event.request.data;
    // Strip query strings from the captured URL to drop token fragments.
    if (typeof event.request.url === "string") {
      try {
        const u = new URL(event.request.url);
        u.search = "";
        event.request.url = u.toString();
      } catch {
        // Malformed URL - leave it as-is rather than crash the hook.
      }
    }
    // Also clear the separate query_string field Sentry sometimes populates.
    delete (event.request as Record<string, unknown>).query_string;
  }
  // Then redact audit-shaped paths from extras/contexts/tags/breadcrumbs (GDPR defense-in-depth).
  return scrubAuditPaths(event, hint);
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Define how likely traces are sampled. Sample 10% in production to control event volume/cost; full sampling in dev.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  beforeSend: scrubServerEvent,
  beforeSendTransaction: scrubServerEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});
