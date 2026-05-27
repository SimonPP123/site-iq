"use client";

import Link from "next/link";
import { trackContactCtaClick } from "@/lib/analytics";

/**
 * End-of-report CTA. Invites the user to get human help with their findings, linking to the existing
 * /contact form pre-filled with the audited domain (no email is exposed; the lead is captured and
 * emailed to the owner via /api/contact). Shown on real reports only - never on the public sample.
 *
 * This is the lead-conversion event: clicking the link fires `contact_cta_click` (domain only, no
 * PII). A client component so the onClick analytics call runs in the browser. Rendered inside the
 * client ReportView, so making it a client component adds no extra boundary cost.
 */
export function ContactCTA({ domain }: { domain: string }) {
  return (
    <section className="surface mt-8 p-6 text-center">
      <h2 className="text-lg font-semibold">Want a hand fixing these?</h2>
      <p className="mx-auto mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
        The report tells you what to fix and why. If you would rather have someone walk through it with
        you - or just get it fixed - reach out. You will talk to me directly, not a ticket queue.
      </p>
      <Link
        href={`/contact?topic=audit&domain=${encodeURIComponent(domain)}`}
        onClick={() => trackContactCtaClick({ audit_domain: domain })}
        className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
      >
        Get help with {domain}
      </Link>
      <p className="mt-3 text-xs text-muted-foreground/80">Usually a reply within 1-2 business days.</p>
    </section>
  );
}
