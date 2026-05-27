"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const STORAGE_KEY = "siteiq-theme";

const ThemeContext = createContext<{
  theme: Theme;
  resolvedTheme: Resolved;
  setTheme: (t: Theme) => void;
} | null>(null);

/**
 * In-house theme provider (no external dependency). Strategy: toggle the `.dark` class on <html>,
 * default to the OS preference ("system"), persist the user's explicit choice to localStorage, and
 * track OS changes while in system mode. An inline script in <head> (layout.tsx) sets the class
 * before first paint using the SAME storage key, so there is no flash of the wrong theme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<Resolved>("dark");

  // Adopt the stored preference once mounted (the pre-paint script already applied the class).
  useEffect(() => {
    let stored: Theme | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    } catch {
      /* localStorage may be unavailable (private mode / SSR) */
    }
    if (stored === "light" || stored === "dark" || stored === "system") setThemeState(stored);
  }, []);

  // Resolve theme -> .dark class, and keep following the OS while in "system".
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const r: Resolved = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      document.documentElement.classList.toggle("dark", r === "dark");
      setResolvedTheme(r);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
    setThemeState(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
