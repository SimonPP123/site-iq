"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { Moon, Sun } from "@/components/icons";

/**
 * Light/dark theme toggle. Defaults follow the OS (`system`); the first
 * click resolves the effective theme and flips to the opposite, after which it cycles
 * light <-> dark. ~44px tap target for accessibility (WCAG 2.5.5).
 *
 * Renders a stable, non-interactive placeholder until mounted so the server and first
 * client render match (the theme is only known on the client) - this avoids a hydration
 * mismatch without causing layout shift.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const base =
    "inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border text-foreground transition hover:border-accent/60";

  if (!mounted) {
    // Match the final markup's box so there is no shift; hidden from a11y tree until live.
    return <span aria-hidden="true" className={`${base} ${className}`} />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={`${base} ${className}`}
    >
      {isDark ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}
