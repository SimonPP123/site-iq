import * as Sentry from "@sentry/nextjs";
import { scrubAuditPaths, scrubBreadcrumb } from "@/lib/sentryScrub";

// Client-side Sentry init (Next 16 + Sentry v10 load this from instrumentation-client.ts).
// A no-op when NEXT_PUBLIC_SENTRY_DSN is unset, so it's safe in local/dev and CI.
const isProd = process.env.NODE_ENV === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Mask all text + block media in session replays so we never ship user input / PII to Sentry.
  integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
  // Replays: a small fraction of sessions in prod, plus a replay whenever an error fires. Off in dev.
  replaysSessionSampleRate: isProd ? 0.1 : 0,
  replaysOnErrorSampleRate: isProd ? 1.0 : 0,
  // Sample only a fraction of transactions in production - 100% would be costly and ship a large
  // volume of (potentially PII-laden) traces at public scale. Full sampling only in development.
  tracesSampleRate: isProd ? 0.1 : 1,
  // Scrub crawled-site paths (result.pages / pagesFailed / failing[].path) from event contexts
  // BEFORE they leave the browser - GDPR defense-in-depth for EU customers (Phase 2E paths are
  // already SENSITIVE_PATH_RE-filtered on the n8n side, this catches anything that slipped past).
  beforeSend: scrubAuditPaths,
  beforeBreadcrumb: scrubBreadcrumb,
});

// Instrument App Router client navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
