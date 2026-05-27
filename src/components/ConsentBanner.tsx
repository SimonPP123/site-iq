"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyConsentUpdate,
  DENIED_CATEGORIES,
  GRANTED_CATEGORIES,
  hasGlobalPrivacyControl,
  readConsent,
  writeConsent,
  type ConsentCategories,
} from "@/lib/consent";

/**
 * In-house GDPR cookie-consent banner + Manage panel. No CMP library, no new dependency.
 *
 * ====================================================================================================
 * CRITICAL - DO NOT RENAME THESE THREE MARKERS:
 *   id="cookie-consent"   data-cookieconsent="banner"   class includes "cookieconsent-banner"
 * Site IQ's OWN audit (check T7) greps the page HTML for CMP markers including `cookie-consent`,
 * `data-cookieconsent` and `cookieconsent`. These honest, descriptive names make siteiq.monkata.ai
 * PASS its own T7 cookie-banner check from the static HTML. Renaming them silently breaks the
 * self-audit. (See checks.ts `det.cmp` and the analytics plan Section 6.4.)
 * ====================================================================================================
 *
 * The OUTER container is server-rendered in the layout (so a no-JS crawl still sees the markers for
 * T7). This client component hydrates the behaviour and toggles visibility from the stored choice.
 *
 * EDPB: "Accept" and "Reject" are equal-weight primary buttons (no dark pattern). "Manage" opens a
 * panel with Analytics / Functional / Targeting toggles plus an always-on "Necessary". Re-openable
 * from anywhere via the Footer's "Cookie settings" link, which dispatches `siteiq:open-consent`.
 *
 * Without NEXT_PUBLIC_GTM_ID there is no GTM/gtag on the page; applyConsentUpdate no-ops safely, the
 * banner still records the user's choice. So this is harmless to render even when GTM is off.
 */

/** Window CustomEvent the Footer dispatches to re-open the Manage panel. */
const OPEN_CONSENT_EVENT = "siteiq:open-consent";

export function ConsentBanner() {
  // null until we have read storage on the client (avoids a hydration flash of the wrong state).
  const [decided, setDecided] = useState<boolean | null>(null);
  const [managing, setManaging] = useState(false);
  // Manage-panel toggle state (Necessary is implicit/always-on and not represented here).
  const [draft, setDraft] = useState<ConsentCategories>(DENIED_CATEGORIES);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // On mount: read any stored choice. If none, show the banner; the Manage draft starts fully denied
  // (nothing pre-ticked). Global Privacy Control: if the browser sends GPC and there is no explicit
  // stored choice, we re-assert the denied signals (a "reject") so the opt-out is honoured and logged
  // - we never auto-GRANT on GPC. The banner still appears so the user can opt in later if they wish.
  useEffect(() => {
    const stored = readConsent();
    if (stored) {
      setDecided(true);
      setDraft(stored.cats);
      return;
    }
    setDecided(false);
    setDraft(DENIED_CATEGORIES);
    if (hasGlobalPrivacyControl()) {
      applyConsentUpdate(DENIED_CATEGORIES, "reject_all");
    }
  }, []);

  // Listen for the Footer's "Cookie settings" event to re-open the Manage panel from any page.
  useEffect(() => {
    const onOpen = () => {
      const stored = readConsent();
      setDraft(stored ? stored.cats : DENIED_CATEGORIES);
      setManaging(true);
      setDecided(false); // reveal the surface even if a choice already exists
    };
    window.addEventListener(OPEN_CONSENT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, onOpen);
  }, []);

  // Move focus to the heading when the banner/panel first appears (a11y) - polite, not a focus trap.
  const visible = decided === false;
  useEffect(() => {
    if (visible) headingRef.current?.focus();
  }, [visible, managing]);

  const persist = useCallback(
    (cats: ConsentCategories, action: "accept_all" | "reject_all" | "custom") => {
      writeConsent(cats);
      applyConsentUpdate(cats, action);
      setManaging(false);
      setDecided(true);
    },
    [],
  );

  const acceptAll = useCallback(() => persist(GRANTED_CATEGORIES, "accept_all"), [persist]);
  const rejectAll = useCallback(() => persist(DENIED_CATEGORIES, "reject_all"), [persist]);
  const saveChoices = useCallback(() => {
    const all = draft.analytics && draft.functional && draft.targeting;
    persist(draft, all ? "accept_all" : "custom");
  }, [draft, persist]);

  // The OUTER element carries the T7 markers and is hidden until we know there is a choice to make.
  // It is always in the DOM (the layout renders the same markers server-side for the no-JS crawl).
  return (
    <section
      id="cookie-consent"
      data-cookieconsent="banner"
      className="cookieconsent-banner"
      role="region"
      aria-label="Cookie consent"
      aria-live="polite"
      hidden={!visible}
    >
      {visible ? (
        <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="surface mx-auto max-w-3xl bg-card p-5 shadow-2xl shadow-black/40 sm:p-6">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-base font-semibold tracking-tight text-foreground outline-none"
            >
              Cookies on Site IQ
            </h2>

            {!managing ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  We&apos;d like to use analytics cookies to see how Site IQ gets used and make it
                  better.
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Nothing loads until you choose - your call. You can change it anytime in Cookie
                  settings. See our{" "}
                  <a
                    href="/privacy#cookies"
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    Privacy &amp; cookies
                  </a>
                  .
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  {/* Accept and Reject are equal-weight primary buttons (EDPB - no dark pattern). */}
                  <button
                    type="button"
                    onClick={acceptAll}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={rejectAll}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => setManaging(true)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40 sm:ml-auto"
                  >
                    Manage
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Choose which cookies Site IQ may use. Necessary cookies keep you signed in and are
                  always on.
                </p>
                <div className="mt-4 space-y-2">
                  <ConsentToggle
                    label="Necessary (always on)"
                    description="Sign-in and security. Required for the service to work."
                    checked
                    disabled
                  />
                  <ConsentToggle
                    label="Analytics"
                    description="Helps us understand how Site IQ is used so we can improve it."
                    checked={draft.analytics}
                    onChange={(v) => setDraft((d) => ({ ...d, analytics: v }))}
                  />
                  <ConsentToggle
                    label="Functional"
                    description="Remembers preferences to make the app nicer to use."
                    checked={draft.functional}
                    onChange={(v) => setDraft((d) => ({ ...d, functional: v }))}
                  />
                  <ConsentToggle
                    label="Targeting"
                    description="Would support ads/personalisation. Site IQ runs none today."
                    checked={draft.targeting}
                    onChange={(v) => setDraft((d) => ({ ...d, targeting: v }))}
                  />
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={saveChoices}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    Save choices
                  </button>
                  <button
                    type="button"
                    onClick={acceptAll}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    Accept all
                  </button>
                  <button
                    type="button"
                    onClick={rejectAll}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    Reject all
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** A single labelled checkbox row for the Manage panel. Necessary uses `disabled` + aria-disabled. */
function ConsentToggle({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3 ${
        disabled ? "opacity-70" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
