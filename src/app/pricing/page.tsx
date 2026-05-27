import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free while in beta. Run audits with a free account; the paid Pro and Agency plans below are a preview of what is planned. A fast first-look that complements full crawlers and grades AI-readiness and consent in the same report.",
  alternates: { canonical: "/pricing" },
};

type Tier = {
  key: string;
  name: string;
  price: string;
  per: string;
  priceNote?: string;
  tagline: string;
  inherits?: string;
  features: string[];
  cta: { label: string; href?: string; disabled?: boolean };
  highlighted?: boolean;
};

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    price: "EUR 0",
    per: "forever",
    tagline: "Everything you need to try Site IQ on a real site.",
    features: [
      "3 audits / month",
      "Up to 10 pages per audit",
      "All 58 checks, with score, grade and 4 sub-scores",
      "AI executive summary",
      "Full prioritized fix list",
      "5 chat messages / audit",
      "7-day history view (data retained up to 90 days)",
    ],
    cta: { label: "Start free", href: "/signup" },
  },
  {
    key: "pro",
    name: "Pro",
    price: "EUR 29",
    per: "/month",
    priceNote: "planned",
    tagline: "For running Site IQ regularly, across more sites and over time.",
    inherits: "Free",
    features: [
      "50 audits / month",
      "100 chat messages / month",
      "12-month history",
      "Weekly re-audits",
      "PDF export",
    ],
    cta: { label: "Contact us", href: "/contact?plan=pro" },
    highlighted: true,
  },
  {
    key: "agency",
    name: "Agency",
    price: "EUR 99",
    per: "/month",
    priceNote: "planned",
    tagline: "Monitoring and white-label reporting for client work.",
    inherits: "Pro",
    features: [
      "250 audits / month",
      "White-label PDF export",
      "Scheduled monitoring + change alerts",
      "500 chat messages / month",
      "Unlimited history",
      "5 team seats",
    ],
    cta: { label: "Contact us", href: "/contact?plan=agency" },
  },
];

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="mt-0.5 h-4 w-4 flex-none text-accent"
    >
      <path
        d="M4 10.5l3.5 3.5L16 5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TierCta({ cta }: { cta: Tier["cta"] }) {
  const base =
    "mt-7 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition";

  if (cta.disabled) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className={`${base} cursor-not-allowed border border-border bg-muted/40 text-muted-foreground`}
      >
        {cta.label}
      </button>
    );
  }

  const isExternal = cta.href?.startsWith("mailto:") || cta.href?.startsWith("http");
  const className = `${base} border border-border text-foreground hover:border-accent/60`;

  if (isExternal) {
    return (
      <a href={cta.href} className={className}>
        {cta.label}
      </a>
    );
  }

  return (
    <Link href={cta.href ?? "#"} className={className}>
      {cta.label}
    </Link>
  );
}

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
        <header className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Pricing</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground text-balance">
            A fast first-look that complements full crawlers like Ahrefs and Screaming Frog - and one
            of the few tools that grade AI-readiness (GEO) and cookie consent in a single report.
          </p>
        </header>

        {/* Beta banner */}
        <div
          role="status"
          className="surface mx-auto mt-8 flex max-w-3xl items-start gap-3 border-l-2 border-l-accent/70 p-4 sm:items-center"
        >
          <span className="mt-1 h-2 w-2 flex-none rounded-full bg-emerald-400 sm:mt-0" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-foreground">
            <span className="font-semibold">Free while in beta</span> - run audits with a free
            account; paid plans below are a preview of what is planned.
          </p>
        </div>

        {/* Tiers */}
        <section aria-label="Plans" className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.key}
              className={
                tier.highlighted
                  ? "surface relative flex h-full flex-col p-6 ring-2 ring-accent"
                  : "surface relative flex h-full flex-col p-6"
              }
            >
              {tier.highlighted ? (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-accent-foreground">
                  Most complete
                </span>
              ) : null}

              <h2 className="text-lg font-semibold text-foreground">{tier.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tier.tagline}</p>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tracking-tight text-foreground">
                  {tier.price}
                </span>
                <span className="text-sm text-muted-foreground">{tier.per}</span>{" "}
                {tier.priceNote ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {tier.priceNote}
                  </span>
                ) : null}
              </div>

              {tier.inherits ? (
                <p className="mt-6 text-sm font-medium text-foreground">
                  Everything in {tier.inherits}, plus:
                </p>
              ) : null}

              <ul className={`${tier.inherits ? "mt-3" : "mt-6"} space-y-2.5 text-sm`}>
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <CheckIcon />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                <TierCta cta={tier.cta} />
              </div>
            </div>
          ))}
        </section>

        {/* Notes */}
        <section aria-labelledby="notes-heading" className="mx-auto mt-14 max-w-3xl">
          <h2 id="notes-heading" className="text-xl font-semibold tracking-tight">
            Good to know
          </h2>
          <dl className="mt-5 space-y-5">
            <div className="surface p-5">
              <dt className="text-sm font-semibold text-foreground">An audit costs nothing to try.</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Create a free account and run a real report on any domain - score, grade, four
                sub-scores, an AI summary, and your top fixes. No card required.
              </dd>
            </div>
            <div className="surface p-5">
              <dt className="text-sm font-semibold text-foreground">
                Limits keep it fast and sustainable.
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Per-plan caps on audits, pages, and chat messages exist so every report stays quick
                and the service stays sustainable - not to nickel-and-dime you.
              </dd>
            </div>
            <div className="surface p-5">
              <dt className="text-sm font-semibold text-foreground">Billing is not live yet.</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Pro and Agency are a preview of what is planned. Nothing is charged today, and the
                free plan stays free while Site IQ is in beta. Want to know what we grade and how?{" "}
                <Link href="/methodology" className="text-accent underline-offset-4 hover:underline">
                  See what we check
                </Link>
                .
              </dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  );
}
