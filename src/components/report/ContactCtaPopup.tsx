"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { trackContactCtaClick } from "@/lib/analytics";

/**
 * A non-blocking "get a hand fixing these" nudge that slides in from the bottom-right AFTER the
 * reader has had a moment to explore. It appears once the reader has scrolled down into the report
 * (any meaningful downward scroll) AND has spent ~10s on the page - and it stays eligible even if
 * they then scroll back to the top, because the scroll signal LATCHES. It never shows while the
 * static end-of-report CTA is already on screen (no double-nudge).
 *
 * Shown ONCE PER BROWSER SESSION, across all reports: once it has appeared (or been dismissed) it
 * stays quiet for the rest of the session - tracked in sessionStorage, which clears when the tab /
 * session ends, so a fresh visit sees it again. Dismissable (X / Esc). Shown on real reports only -
 * the caller gates it on `status === "done" && !demo`, like the static <ContactCTA>.
 *
 * The trigger predicate is split out as a pure function so it can be unit-tested without a DOM.
 */
export function shouldShowCtaPopup(s: {
  hasScrolledDown: boolean;
  dwellElapsed: boolean;
  staticCtaVisible: boolean;
  dismissed: boolean;
}): boolean {
  return s.hasScrolledDown && s.dwellElapsed && !s.staticCtaVisible && !s.dismissed;
}

const DWELL_MS = 10_000; // give the reader ~10s with the report before nudging
// "Some scroll down" - a few wheel ticks. Low enough that any real engagement arms it, high enough
// that an accidental jog of the page does not. Once crossed it latches (see the effect below).
const SCROLL_THRESHOLD_PX = 300;
// Session-scoped, single key (not per-report, not permanent): the nudge shows once per browsing
// session across any report. sessionStorage clears when the tab/session ends, so a return visit
// sees it again. To re-trigger while testing: open a new tab or clear this key.
const SESSION_SEEN_KEY = "siteiq-cta-seen";

export function ContactCtaPopup({
  domain,
  staticCtaId = "report-static-cta",
}: {
  domain: string;
  staticCtaId?: string;
}) {
  const [hasScrolledDown, setHasScrolledDown] = useState(false);
  const [dwellElapsed, setDwellElapsed] = useState(false);
  const [staticCtaVisible, setStaticCtaVisible] = useState(false);
  // Start "dismissed" so nothing can flash before we've read prior session state.
  const [dismissed, setDismissed] = useState(true);
  // Drives the entrance transition (mounted=false on first paint, flipped true next frame).
  const [entered, setEntered] = useState(false);

  // Has the nudge already been shown/dismissed earlier in THIS session? (once-per-session gate)
  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SESSION_SEEN_KEY) === "1";
    } catch {
      /* storage blocked - treat as not-seen so the nudge can still show */
    }
    setDismissed(seen);
  }, []);

  // Dwell timer.
  useEffect(() => {
    const t = setTimeout(() => setDwellElapsed(true), DWELL_MS);
    return () => clearTimeout(t);
  }, []);

  // Arm once the reader has scrolled down past the threshold. This LATCHES: once they have scrolled
  // down, the signal stays armed even if they scroll back to the top - so the nudge can still appear
  // wherever they are on the page, as long as there was some downward scroll at some point.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.scrollY > SCROLL_THRESHOLD_PX) {
      setHasScrolledDown(true); // already scrolled (e.g. a restored scroll position) - no listener needed
      return;
    }
    const onScroll = () => {
      if (window.scrollY > SCROLL_THRESHOLD_PX) {
        setHasScrolledDown(true);
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Suppress while the static bottom CTA is on screen (no double-nudge); re-eligible once it scrolls off.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const staticCta = document.getElementById(staticCtaId);
    if (!staticCta) return;
    const io = new IntersectionObserver((entries) => {
      setStaticCtaVisible(entries.some((e) => e.isIntersecting));
    });
    io.observe(staticCta);
    return () => io.disconnect();
  }, [staticCtaId]);

  const markSeen = useCallback(() => {
    try {
      window.sessionStorage.setItem(SESSION_SEEN_KEY, "1");
    } catch {
      /* storage blocked - it just won't be remembered; may re-show on the next navigation */
    }
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    markSeen();
  }, [markSeen]);

  const visible = shouldShowCtaPopup({ hasScrolledDown, dwellElapsed, staticCtaVisible, dismissed });

  // Once it actually shows, mark the session as seen (so it will not reappear on the next report this
  // session) and trigger the slide-in on the next frame.
  useEffect(() => {
    if (!visible) return;
    markSeen();
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [visible, markSeen]);

  // Esc closes it (only while shown).
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="Get a hand fixing your audit findings"
      className={`surface fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] p-5 shadow-xl
        transition duration-300 ease-out motion-reduce:transition-none
        ${entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded p-0.5 text-muted-foreground transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
      <h3 className="pr-6 text-base font-semibold">Want a hand fixing these?</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Rather have someone walk through the report with you - or just get it fixed? You will talk to
        me directly, not a ticket queue.
      </p>
      <Link
        href={`/contact?topic=audit&domain=${encodeURIComponent(domain)}`}
        onClick={() => {
          trackContactCtaClick({ audit_domain: domain });
          dismiss(); // clicking is a conversion - don't nudge again this session
        }}
        className="mt-3 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
      >
        Get help with {domain}
      </Link>
    </aside>
  );
}
