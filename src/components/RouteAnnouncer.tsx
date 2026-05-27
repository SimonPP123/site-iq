"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Announces client-side route changes to assistive tech. App-Router SPA navigations don't speak the
 * new page, so screen-reader users get no feedback that the view changed. This renders a visually
 * hidden, polite aria-live region that announces the new document title after each navigation.
 *
 * Announce-only by design: it does NOT move focus (focus-stealing on navigation is its own UX hazard),
 * so it is invisible and inert for sighted users (sr-only) and purely additive for SR users.
 */
export function RouteAnnouncer() {
  const pathname = usePathname();
  const [message, setMessage] = useState("");
  const firstRender = useRef(true);

  useEffect(() => {
    // Skip the initial load - the browser already announces the first page.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Defer a tick so document.title reflects the newly-rendered route.
    const id = window.setTimeout(() => {
      setMessage(`Navigated to ${document.title || pathname}`);
    }, 100);
    return () => window.clearTimeout(id);
  }, [pathname]);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
