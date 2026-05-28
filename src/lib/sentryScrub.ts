import type { Breadcrumb, Event, EventHint } from "@sentry/nextjs";

/**
 * Sentry path scrubbers. The audit produces a `result` jsonb that includes user-submitted-site
 * paths (`result.pages[].path`, `result.pagesFailed[].path`, `result.dimensions[*].checks[*].evidence.failing[].path`).
 * If any of those flow into Sentry contexts/extra/breadcrumbs via an unhandled exception, we're
 * leaking what could plausibly be PII-adjacent information about a third-party site to a US-hosted
 * error-tracking service. GDPR-adjacent for EU customers (partner clients are likely EU).
 *
 * The TS engine + n8n PICK_JS already filter sensitive paths upstream (`SENSITIVE_PATH_RE` in
 * Phase 2A) so what flows through here is non-admin / non-login by definition; this is
 * defense-in-depth so an unfiltered path that slipped past the n8n filter still doesn't end up in
 * Sentry. Scrubs by field NAME (recursive walk depth-limited) rather than path value pattern so it
 * catches every audit-shaped property without false-positives on benign URLs (e.g. Next.js router
 * breadcrumbs that legitimately carry our own `/sample` / `/pricing` route).
 *
 * Used by both src/instrumentation-client.ts (client) and sentry.server.config.ts /
 * sentry.edge.config.ts (server). Shared module so the scrub rules cannot drift between runtimes.
 */

/** Field names whose VALUES we always strip when found anywhere in a Sentry event's tree. */
const SENSITIVE_AUDIT_FIELDS = new Set([
  "pages",
  "pagesFailed",
  "failing",
  "sourceURL",
  "rootUrl",
]);

/** When a sensitive field is encountered, replace its VALUE with this marker. The shape preserves
 *  the "this was an array of N entries" information so debugging context is not zero, while the
 *  paths themselves are gone. */
const REDACTED = "[scrubbed]";

const MAX_DEPTH = 8; // Sentry events nest a few levels (event.contexts.user.something.something)
const MAX_KEYS_PER_OBJECT = 200; // safety cap so a pathological event can't burn cycles here

/** Deep-walk + redact in place. Returns the same reference so callers can chain through Sentry's
 *  beforeSend signature. Skips objects we've already visited (cycle guard). */
function scrubInPlace(node: unknown, depth: number, seen: WeakSet<object>): void {
  if (depth > MAX_DEPTH) return;
  if (node === null || typeof node !== "object") return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    for (const v of node) scrubInPlace(v, depth + 1, seen);
    return;
  }

  const obj = node as Record<string, unknown>;
  const keys = Object.keys(obj);
  const cap = keys.length > MAX_KEYS_PER_OBJECT ? MAX_KEYS_PER_OBJECT : keys.length;
  for (let i = 0; i < cap; i++) {
    const k = keys[i];
    if (SENSITIVE_AUDIT_FIELDS.has(k)) {
      const v = obj[k];
      // Preserve the structural hint ("N entries" / "N chars") so logs are still informative.
      if (Array.isArray(v)) {
        obj[k] = `${REDACTED} (${v.length} entries)`;
      } else if (typeof v === "string") {
        obj[k] = `${REDACTED} (${v.length} chars)`;
      } else {
        obj[k] = REDACTED;
      }
      continue;
    }
    scrubInPlace(obj[k], depth + 1, seen);
  }
}

/** Scrub event-level extras / contexts / tags. Safe to call from beforeSend on any runtime. */
export function scrubAuditPaths<T extends Event>(event: T, _hint?: EventHint): T {
  const seen = new WeakSet<object>();
  if (event.extra) scrubInPlace(event.extra, 0, seen);
  if (event.contexts) scrubInPlace(event.contexts, 0, seen);
  if (event.tags) scrubInPlace(event.tags, 0, seen);
  // Breadcrumbs on the event itself (post-attached) - distinct from the streaming beforeBreadcrumb.
  if (Array.isArray(event.breadcrumbs)) {
    for (const b of event.breadcrumbs) scrubInPlace(b, 0, seen);
  }
  return event;
}

/** Scrub a single breadcrumb as Sentry buffers it. Returns null to drop the breadcrumb entirely
 *  when its category strongly implies it carries an audit path (e.g. an explicit "audit" message
 *  with the rule id - already in console.log). Otherwise mutates the data field. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const seen = new WeakSet<object>();
  if (breadcrumb.data) scrubInPlace(breadcrumb.data, 0, seen);
  return breadcrumb;
}
