import type { Breadcrumb, Event, EventHint } from "@sentry/nextjs";

/**
 * Sentry path scrubbers. The audit produces a `result` jsonb that includes user-submitted-site
 * paths (`result.pages[].path`, `result.pagesFailed[].path`, `result.dimensions[*].checks[*].evidence.failing[].path`).
 * If any of those flow into Sentry contexts/extra/breadcrumbs via an unhandled exception, we're
 * leaking what could plausibly be PII-adjacent information about a third-party site to a US-hosted
 * error-tracking service. GDPR-adjacent for EU customers (likely EU-based).
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

/**
 * Redact the PATH + QUERY of any full URL in a free-text string, keeping the scheme+host so the
 * value still says WHICH service failed. The field-name walk (scrubInPlace) only catches structured
 * data; a thrown Error on the audit/chat path embeds the user-submitted target URL directly in
 * event.message / event.exception[].value (DNS/fetch failures, third-party lib exceptions). For
 * EU customers, for whom the crawled path is the GDPR-adjacent leak the whole scrubber exists to
 * prevent, via the one channel the structured walk does not cover.
 * `https://victim.example/customer/42?token=x` -> `https://victim.example/[redacted]`
 * Handles query-only URLs (no path slash) and strips userinfo, since those also carry secrets:
 * `https://victim.example?token=secret` -> `https://victim.example/[redacted]`
 * `https://user:pass@host/p`            -> `https://host/[redacted]`
 */
// Host class excludes / ? # so a query-only URL (no path slash) still splits origin from the
// secret-bearing remainder; the remainder group triggers on any of / ? # (not just /).
const URL_PATH_RE = /(https?:\/\/[^/?#\s"')]+)([/?#][^\s"')]*)?/gi;
export function redactUrlPaths(s: string): string {
  if (typeof s !== "string" || s.length === 0) return s;
  return s.replace(URL_PATH_RE, (_m, origin: string, rest?: string) => {
    // Strip embedded userinfo (user:pass@) - it is a credential, never debugging signal.
    const cleanOrigin = origin.replace(/(https?:\/\/)[^@/]*@/i, "$1");
    return rest && rest.length > 0 ? `${cleanOrigin}/[redacted]` : cleanOrigin;
  });
}

/** Scrub event-level extras / contexts / tags + the message/exception free-text values. Safe to
 *  call from beforeSend on any runtime. */
export function scrubAuditPaths<T extends Event>(event: T, _hint?: EventHint): T {
  const seen = new WeakSet<object>();
  if (event.extra) scrubInPlace(event.extra, 0, seen);
  if (event.contexts) scrubInPlace(event.contexts, 0, seen);
  if (event.tags) scrubInPlace(event.tags, 0, seen);
  // Breadcrumbs on the event itself (post-attached) - distinct from the streaming beforeBreadcrumb.
  if (Array.isArray(event.breadcrumbs)) {
    for (const b of event.breadcrumbs) scrubInPlace(b, 0, seen);
  }
  // Free-text value pass: redact crawled-URL paths from the headline message and every exception
  // value (these are NOT field-name reachable and are the most common real leak channel).
  if (typeof event.message === "string") {
    event.message = redactUrlPaths(event.message);
  }
  const exc = event.exception?.values;
  if (Array.isArray(exc)) {
    for (const e of exc) {
      if (e && typeof e.value === "string") e.value = redactUrlPaths(e.value);
    }
  }
  return event;
}

/** Scrub a single breadcrumb as Sentry buffers it. Returns null to drop the breadcrumb entirely
 *  when its category strongly implies it carries an audit path (e.g. an explicit "audit" message
 *  with the rule id - already in console.log). Otherwise mutates the data field. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const seen = new WeakSet<object>();
  if (breadcrumb.data) scrubInPlace(breadcrumb.data, 0, seen);
  // Breadcrumbs are the most common URL carrier (fetch/xhr/navigation crumbs). The field-name walk
  // above does NOT catch `data.url` / `data.to` / `data.from` (full requested URL + query) or the
  // free-text `message`, so redact those explicitly - this is the crawled-URL leak channel that
  // fires on every server-side fetch to a user-influenced URL.
  const data = breadcrumb.data as Record<string, unknown> | undefined;
  if (data) {
    for (const k of ["url", "to", "from"]) {
      if (typeof data[k] === "string") data[k] = redactUrlPaths(data[k] as string);
    }
  }
  if (typeof breadcrumb.message === "string") {
    breadcrumb.message = redactUrlPaths(breadcrumb.message);
  }
  return breadcrumb;
}
