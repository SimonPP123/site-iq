import * as Sentry from "@sentry/nextjs";
import type { Event, EventHint } from "@sentry/nextjs";

/**
 * Strip PII from edge/middleware Sentry events before they leave the process. The middleware layer
 * (auth callback, redirect handling, route gating) sees user-submitted domains, `next`/`redirect`
 * params, and cookie fragments - none of which belong in error reports. Mirrors sentry.server.config.ts.
 */
function scrubEdgeEvent<T extends Event>(event: T, _hint: EventHint): T {
    if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (typeof event.request.url === "string") {
            try {
                const u = new URL(event.request.url);
                u.search = "";
                event.request.url = u.toString();
            } catch {
                // Malformed URL - leave it rather than crash the hook.
            }
        }
        delete (event.request as Record<string, unknown>).query_string;
    }
    return event;
}

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Sample 10% in production to control event volume/cost; full sampling in dev.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
    debug: false,
    beforeSend: scrubEdgeEvent,
    beforeSendTransaction: scrubEdgeEvent,
});
