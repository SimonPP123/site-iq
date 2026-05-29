"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { trackContactCtaClick } from "@/lib/analytics";

/**
 * A non-blocking "get a hand fixing these" nudge that slides in from the bottom-right AFTER the
 * reader has had time to explore - it appears only once the user has scrolled past the findings AND
 * spent enough time on the page, and never while the static end-of-report CTA is already on screen
 * (no double-nudge). Dismissable (X / Esc), remembered per-report in localStorage so it never
 * re-pops, and suppressed entirely once dismissed or clicked. Shown on real reports only - the
 * caller gates it on `status === "done" && !demo`, exactly like the static <ContactCTA>.
 *
 * The trigger predicate is split out as a pure function so it can be unit-tested without a DOM.
 */
export function shouldShowCtaPopup(s: {
  scrolledPastFindings: boolean;
  dwellElapsed: boolean;
  staticCtaVisible: boolean;
  dismissed: boolean;
}): boolean {
  return s.scrolledPastFindings && s.dwellElapsed && !s.staticCtaVisible && !s.dismissed;
}

const DWELL_MS = 20_000; // give the reader ~20s with the report before nudging
const dismissKey = (reportId: string) => `siteiq-cta-dismissed-${reportId}`;

export function ContactCtaPopup({
  domain,
  reportId,
  findingsAnchorId = "report-findings-end",
  staticCtaId = "report-static-cta",
}: {
  domain: string;
  reportId: string;
  findingsAnchorId?: string;
  staticCtaId?: string;
}) {
  const [scrolledPastFindings, setScrolledPast] = useState(false);
  const [dwellElapsed, setDwellElapsed] = useState(false);
  const [staticCtaVisible, setStaticCtaVisible] = useState(false);
  // Start "dismissed" so nothing can flash before we've read prior state from localStorage.
  const [dismissed, setDismissed] = useState(true);
  // Drives the entrance transition (mounted=false on first paint, flipped true next frame).
  const [entered, setEntered] = useState(false);

  // Read any prior dismissal once (a previous dismiss OR a previous click both set this).
  useEffect(() => {
    let prior = false;
    try {
      prior = window.localStorage.getItem(dismissKey(reportId)) === "1";
    } catch {
      /* storage blocked - treat as not-dismissed so the nudge can still show */
    }
    setDismissed(prior);
  }, [reportId]);

  // Dwell timer.
  useEffect(() => {
    const t = setTimeout(() => setDwellElapsed(true), DWELL_MS);
    return () => clearTimeout(t);
  }, []);

  // Arm on scrolling past the findings; suppress while the static bottom CTA is on screen.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observers: IntersectionObserver[] = [];
    const findings = document.getElementById(findingsAnchorId);
    if (findings) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) setScrolledPast(true); // latch: once past, stays armed
      });
      io.observe(findings);
      observers.push(io);
    }
    const staticCta = document.getElementById(staticCtaId);
    if (staticCta) {
      const io = new IntersectionObserver((entries) => {
        setStaticCtaVisible(entries.some((e) => e.isIntersecting));
      });
      io.observe(staticCta);
      observers.push(io);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [findingsAnchorId, staticCtaId]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(reportId), "1");
    } catch {
      /* storage blocked - it just won't be remembered across reloads */
    }
  }, [reportId]);

  const visible = shouldShowCtaPopup({ scrolledPastFindings, dwellElapsed, staticCtaVisible, dismissed });

  // Trigger the slide-in on the frame after it becomes visible.
  useEffect(() => {
    if (!visible) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [visible]);

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
          dismiss(); // clicking is a conversion - don't nudge again
        }}
        className="mt-3 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
      >
        Get help with {domain}
      </Link>
    </aside>
  );
}
