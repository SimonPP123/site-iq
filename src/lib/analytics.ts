/**
 * In-house dataLayer helper + typed event wrappers (no third-party dependency).
 *
 * Events are pushed to `window.dataLayer` regardless of consent; Google Tag Manager only forwards
 * them to GA4 when `analytics_storage` is granted (Consent Mode gates the TAG, not the dataLayer).
 * That is the textbook-correct behaviour and matches how Site IQ's own audit expects a clean setup.
 *
 * PII RULE (hard): no event below may ever carry an email, a password, chat message TEXT, or a full
 * audited URL/path. Only the bare domain the user typed, a report id, a category, a status, or a
 * LENGTH is allowed. The unit tests in analytics.test.ts assert this and must keep passing.
 *
 * Everything here is SSR-safe: `pushDL` no-ops on the server (no `window`), so the typed wrappers
 * can be called from client components without a `typeof window` guard at every call site.
 */

/** A dataLayer payload always carries an `event` name plus arbitrary (non-PII) params. */
export type DLEvent = Record<string, unknown> & { event: string };

type DataLayerWindow = Window & { dataLayer?: unknown[] };

/**
 * Push one event onto the GTM dataLayer. No-op during SSR (server has no `window`). Initialises the
 * dataLayer array if a push happens before the inline bootstrap has run (defensive; the bootstrap
 * normally creates it first in the document head).
 */
export function pushDL(payload: DLEvent): void {
  if (typeof window === "undefined") return;
  const w = window as DataLayerWindow;
  if (!Array.isArray(w.dataLayer)) w.dataLayer = [];
  w.dataLayer.push(payload);
}

// --- Typed event wrappers -------------------------------------------------------------------
// One function per dataLayer event. Keeping them here (not inline at call sites) makes the event
// contract explicit, keeps the param names consistent with the GTM triggers, and lets the tests
// pin the exact payload shape so a refactor cannot silently leak PII.

/** Successful sign-up request (email-confirm may still be pending). Method only, never the email. */
export function trackSignUp(params: { method: "password" }): void {
  pushDL({ event: "sign_up", method: params.method });
}

/** Successful authentication. Method only, never the email or password. */
export function trackLogin(params: { method: "password" }): void {
  pushDL({ event: "login", method: params.method });
}

/** An audit was accepted by the API (2xx). Bare domain only - never a full path or query string. */
export function trackAuditStarted(params: { audit_domain: string }): void {
  pushDL({ event: "audit_started", audit_domain: params.audit_domain });
}

/** A report finished. Domain + report id + the terminal status; no crawled content. */
export function trackAuditCompleted(params: {
  audit_domain: string;
  report_id: string;
  audit_status: "done";
}): void {
  pushDL({
    event: "audit_completed",
    audit_domain: params.audit_domain,
    report_id: params.report_id,
    audit_status: params.audit_status,
  });
}

/** A finished LIVE report was viewed. Report id only. */
export function trackReportViewed(params: { report_id: string }): void {
  pushDL({ event: "report_viewed", report_id: params.report_id });
}

/** The public marketing sample report was viewed. Sample id only (distinguishes it from a real view). */
export function trackSampleViewed(params: { sample_id: string }): void {
  pushDL({ event: "sample_report_viewed", sample_id: params.sample_id });
}

/** A chat message was sent. LENGTH ONLY - the message text is never sent (privacy / PII). */
export function trackChatMessageSent(params: { chat_message_length: number }): void {
  pushDL({ event: "chat_message_sent", chat_message_length: params.chat_message_length });
}

/** The end-of-report "get help" lead CTA was clicked. The lead-conversion event. Domain only. */
export function trackContactCtaClick(params: { audit_domain: string }): void {
  pushDL({ event: "contact_cta_click", audit_domain: params.audit_domain });
}
