import Link from "next/link";
import { FooterAuthLink } from "@/components/FooterAuthLink";

/**
 * Global site footer: legal links + an honest AI-disclosure line (EU AI Act Art. 50). Contact and
 * legal-entity details are placeholders for the owner to fill before a public launch.
 */
export function Footer() {
  return (
    <footer className="mt-20 border-t border-border/60">
      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Link href="/" className="text-sm font-semibold accent-text">Site IQ</Link>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            A website intelligence report: SEO, tracking, AI-readiness and tech, scored and explained.
          </p>
        </div>
        <nav className="text-sm" aria-label="Product">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Product</div>
          <ul className="space-y-1.5">
            <li><Link href="/#how-it-works" className="text-muted-foreground transition hover:text-foreground">How it works</Link></li>
            <li><Link href="/methodology" className="text-muted-foreground transition hover:text-foreground">What we check</Link></li>
            <li><Link href="/pricing" className="text-muted-foreground transition hover:text-foreground">Pricing</Link></li>
          </ul>
        </nav>
        <nav className="text-sm" aria-label="Legal">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Legal</div>
          <ul className="space-y-1.5">
            <li><Link href="/privacy" className="text-muted-foreground transition hover:text-foreground">Privacy</Link></li>
            <li><Link href="/terms" className="text-muted-foreground transition hover:text-foreground">Terms &amp; acceptable use</Link></li>
          </ul>
        </nav>
        <nav className="text-sm" aria-label="Company">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Company</div>
          <ul className="space-y-1.5">
            <li><Link href="/contact" className="text-muted-foreground transition hover:text-foreground">Contact us</Link></li>
            <li><FooterAuthLink /></li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-5xl px-6 pb-10 text-xs text-muted-foreground/80">
        <p>
          Scores are computed by deterministic rules; the executive summary and chat are AI-generated and may be
          imperfect. We read only public pages and never modify the sites you audit.
        </p>
        <p className="mt-2">© {new Date().getFullYear()} Site IQ.</p>
      </div>
    </footer>
  );
}
