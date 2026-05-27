"use client";

/**
 * Footer "Cookie settings" control. Re-opens the consent Manage panel from any page by dispatching
 * the SAME window CustomEvent the ConsentBanner subscribes to (`siteiq:open-consent`). This is the
 * GDPR "easy withdrawal" entry point - keep the event name in sync with ConsentBanner's listener.
 *
 * A real <button> (keyboard-reachable, visible focus ring) styled to match the other footer links.
 * SSR-safe: the dispatch only runs in the browser on click.
 */

/** Must match the event name ConsentBanner listens for. */
const OPEN_CONSENT_EVENT = "siteiq:open-consent";

export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_CONSENT_EVENT))}
      className="rounded-sm text-left text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
    >
      Cookie settings
    </button>
  );
}
