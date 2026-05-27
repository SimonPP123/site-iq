"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, X } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Primary navigation shown on every page (the same links on desktop and in the mobile menu). */
const NAV = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "What we check", href: "/methodology" },
  { label: "Pricing", href: "/pricing" },
];

/** The Site IQ gauge mark - a score-ring arc with an end node; mirrors the favicon/brand. */
function GaugeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5.6 18.4A9 9 0 1 1 19 6.5" stroke="url(#siteiq-mark)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="19.1" cy="6.7" r="1.9" fill="#7c6cff" />
      <defs>
        <linearGradient id="siteiq-mark" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5b46e0" />
          <stop offset="1" stopColor="#9b8cff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * App header: brand mark + primary nav + auth state. Sticky/frozen on scroll with a glass
 * (backdrop-blur) background that gains a border + shadow once the page scrolls. Responsive -
 * the nav collapses into a toggle menu under the sm breakpoint.
 */
export function SiteHeader() {
  const [email, setEmail] = useState<string | null | undefined>(undefined); // undefined = still loading
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setEmail(session?.user?.email ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // Frozen header: a subtle border + shadow appear once the page is scrolled past the top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function signOut() {
    setMenuOpen(false);
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const navLinks = NAV.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={() => setMenuOpen(false)}
      className="text-muted-foreground transition-colors hover:text-foreground"
    >
      {item.label}
    </Link>
  ));

  const authControls =
    email === undefined ? null : email ? (
      <>
        <Link
          href="/audits"
          onClick={() => setMenuOpen(false)}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          My audits
        </Link>
        <Link
          href="/account"
          onClick={() => setMenuOpen(false)}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          Account
        </Link>
        <button onClick={signOut} className="text-muted-foreground transition-colors hover:text-foreground">
          Log out
        </button>
      </>
    ) : (
      <Link
        href="/login"
        onClick={() => setMenuOpen(false)}
        className="rounded-lg border border-border px-3 py-1.5 text-foreground transition hover:border-accent/60 hover:bg-accent/5"
      >
        Log in
      </Link>
    );

  return (
    <header
      className={`sticky top-0 z-40 border-b backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-300 ${
        scrolled
          ? "border-border bg-background/80 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.18)]"
          : "border-border/40 bg-background/55"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="Site IQ home">
          <GaugeMark className="h-7 w-7 transition-transform duration-300 group-hover:rotate-[18deg]" />
          <span className="font-display text-base font-bold accent-text">Site IQ</span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm sm:flex">
          {navLinks}
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          {authControls}
          <ThemeToggle className="h-9 w-9" />
        </nav>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          aria-label="Toggle menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-foreground transition hover:border-accent/60 sm:hidden"
        >
          {menuOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Mobile menu panel */}
      {menuOpen ? (
        <nav
          id="site-menu"
          aria-label="Mobile menu"
          className="flex flex-col gap-3 border-t border-border bg-background/95 px-6 py-4 text-sm backdrop-blur-md sm:hidden"
        >
          {navLinks}
          <span className="h-px bg-border" />
          {authControls}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
        </nav>
      ) : null}
    </header>
  );
}
