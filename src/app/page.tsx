"use client";

import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { normalizeDomain } from "@/lib/domain";
import { trackAuditStarted } from "@/lib/analytics";

const EXAMPLES = ["stripe.com", "vercel.com", "linear.app"];

/* ---------- small presentational helpers (landing-only) ---------- */

function SectionHeading({
  eyebrow,
  title,
  intro,
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? (
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent/90">{eyebrow}</p>
      ) : null}
      <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {intro ? <p className="mt-4 text-base leading-relaxed text-muted-foreground">{intro}</p> : null}
    </div>
  );
}

/* A tiny static "gauge" ring rendered with conic-gradient - no chart lib needed. */
function MockGauge({ grade, score }: { grade: string; score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div
      className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(var(--color-accent) ${pct * 3.6}deg, var(--color-border) 0deg)`,
      }}
      role="img"
      aria-label={`Example overall grade ${grade}, ${score} out of 100`}
    >
      <div className="flex h-[6.25rem] w-[6.25rem] flex-col items-center justify-center rounded-full bg-card">
        <span className="text-3xl font-semibold leading-none accent-text">{grade}</span>
        <span className="mt-1 text-xs text-muted-foreground">{score}/100</span>
      </div>
    </div>
  );
}

function SubScoreChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 px-3 py-2 text-left">
      <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function FindingRow({
  impact,
  title,
  detail,
}: {
  impact: "High" | "Medium";
  title: string;
  detail: string;
}) {
  const tone =
    impact === "High"
      ? "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300"
      : "border-sky-400/40 bg-sky-400/10 text-sky-700 dark:text-sky-300";
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-background/40 p-3 text-left">
      <span className={`mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[0.65rem] font-medium ${tone}`}>
        {impact}
      </span>
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group surface px-5 py-4 text-left transition open:bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground">
        {question}
        <span
          aria-hidden="true"
          className="shrink-0 text-muted-foreground transition group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}

/* ---------- structured data (SEO / AI engines) ---------- */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteiq.monkata.ai";

/* The six FAQ Q&As below MUST stay verbatim-equal to the rendered <Faq> copy in the JSX
   (Google requires schema FAQ text to match what users see). When editing a question or
   answer, update BOTH places. Answers are plain text - no markup, no smart quotes. */
const FAQ_ENTRIES: { q: string; a: string }[] = [
  {
    q: "Is the score guessed by an AI?",
    a: 'No. The 0-100 score is computed by 58 deterministic rules - things like "does the page have a title between 15 and 60 characters?", "is there a canonical tag?", "is HTTPS enabled?" The same site always gets the same score. AI only writes the plain-English summary and answers your chat questions; it never decides the grade.',
  },
  {
    q: "Who can see my report, and is my data safe?",
    a: "Your reports are private to your account. The browser only ever sees your own data, enforced at the database level. See our privacy policy for the details.",
  },
  {
    q: "Why might a great site score lower on tracking?",
    a: "Many sites load their analytics and consent tags at runtime through a tag manager (like Google Tag Manager). A crawler reads the page source and cannot always see tags that are injected later, so we report tracking conservatively and never let an unconfirmed tracking gap drag down your overall grade.",
  },
  {
    q: "How many pages do you crawl?",
    a: "Up to 10 pages per site. We start from the homepage, read robots.txt and the sitemap, and crawl the most important pages - enough for a representative snapshot in about two minutes.",
  },
  {
    q: "Do I need to install or verify anything?",
    a: "No. There is nothing to install, no DNS record to add, and no tracking snippet to embed. You paste a domain and we do the rest.",
  },
  {
    q: "How is this different from Lighthouse or Ahrefs?",
    a: "Lighthouse measures performance and accessibility on a single page. Ahrefs and Screaming Frog are deep, paid SEO suites. Site IQ is a fast first-look that combines SEO, tracking and consent, AI-readiness, and tech into one honest grade with a chat - ideal before you dive into a heavier tool, not a replacement for one.",
  },
];

/* SoftwareApplication describing Site IQ + an offers list mirroring the Free/Pro/Agency tiers
   in /pricing (EUR 0 / 29 / 99). FAQPage built from FAQ_ENTRIES so the rich result matches the
   visible Q&As. Both reference APP_URL (same site identity as the Organization/WebSite in layout). */
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Site IQ",
      url: APP_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Site IQ crawls up to 10 pages and runs 58 objective checks across SEO, tracking, AI-readiness (GEO) and tech, then returns a 0-100 grade, a prioritized fix list, and a chat grounded in the site's real pages.",
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "EUR" },
        { "@type": "Offer", name: "Pro", price: "29", priceCurrency: "EUR" },
        { "@type": "Offer", name: "Agency", price: "99", priceCurrency: "EUR" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ_ENTRIES.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ],
};

/* ---------- page ---------- */

const STEPS: [string, string, string][] = [
  ["1", "Enter a domain", "Paste any URL you own or are allowed to audit. No tags, plugins, or account verification to set up."],
  ["2", "We crawl and run 58 checks", "We fetch robots.txt and the sitemap, crawl up to 10 pages, and run 58 objective checks across SEO, tracking, AI-readiness and tech. Takes about 2 minutes."],
  ["3", "Get a graded report and chat", "A 0-100 grade with four sub-scores, a plain-English summary, a fix-ranked action plan, and a chat you can ask about the site's real pages."],
];

const DIMENSIONS: { name: string; weight: string; headline: string; body: ReactNode }[] = [
  {
    name: "AI-Readiness / GEO",
    weight: "25%",
    headline: "Be found when people ask an AI, not just Google",
    body: "Checks structured data (schema.org / JSON-LD), server-rendered content, direct-answer openings, FAQ structure, and whether AI crawlers like GPTBot and ClaudeBot are allowed in. This is the part most audit tools ignore entirely.",
  },
  {
    name: "SEO",
    weight: "30%",
    headline: "The fundamentals search engines reward",
    body: "Title and meta-description length, canonical tags, indexability (no stray noindex), a single clear H1, content depth, and a working sitemap. The classics, scored objectively.",
  },
  {
    name: "Tracking & consent",
    weight: "25%",
    headline: "Measure your traffic without breaking privacy law",
    body: (
      <>
        Looks for GA4, Google Tag Manager, Consent Mode v2 signals, a cookie-consent banner, and ad/social
        pixels. Honest caveat: many sites inject these tags at runtime via a tag manager, so a crawler cannot
        always confirm they are present. We say so in the report and never let a tracking gap drag down your
        overall grade.
      </>
    ),
  },
  {
    name: "Tech basics",
    weight: "20%",
    headline: "The hygiene that quietly costs you visitors",
    body: "HTTPS, a robots.txt that is not blocking your whole site, a mobile viewport, no mixed content, and basic performance hygiene. Small things that break rankings and trust when they are wrong.",
  },
];

export default function Home() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Restore a domain a logged-out visitor tried to audit before signing up (stashed on the 401 below),
  // so they do not have to retype it after confirming their email and signing in.
  useEffect(() => {
    try {
      const pending = localStorage.getItem("siteiq:pendingDomain");
      if (pending) {
        setDomain(pending);
        localStorage.removeItem("siteiq:pendingDomain");
      }
    } catch {
      /* localStorage unavailable - ignore */
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const valid = normalizeDomain(domain);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      if (res.status === 401) {
        // New visitor with no session: send them to signup (the right door for first-time users), and
        // stash the domain so it is restored on return - no retyping after email confirm + sign in.
        try {
          localStorage.setItem("siteiq:pendingDomain", domain);
        } catch {
          /* localStorage unavailable - ignore */
        }
        router.push("/signup");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }
      // Audit accepted (2xx). Fire AFTER success, BEFORE navigating - never on the 401 (signup) or
      // error paths above. Send the normalized domain only, never a full path/query (no PII).
      trackAuditStarted({ audit_domain: valid.domain });
      router.push(`/audit/${data.reportId}`);
    } catch {
      setError("Could not reach the server");
      setLoading(false);
    }
  }

  const canSubmit = !loading && domain.trim().length >= 3;

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SiteHeader />

      <main id="main-content" className="flex-1">
        {/* ---------- 1. HERO ---------- */}
        <section className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pb-10 pt-16 text-center sm:pt-24">
          <Image
            src="/hero-audit.png"
            alt=""
            width={224}
            height={224}
            priority
            className="mb-5 h-32 w-32 select-none sm:h-44 sm:w-44"
          />
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> A full website report card in about 2 minutes
          </span>

          <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            See exactly what is wrong
            <br className="hidden sm:block" /> with any website.
          </h1>

          <p className="mt-5 max-w-xl text-balance text-lg leading-relaxed text-muted-foreground">
            Site IQ crawls up to 10 pages and runs 58 objective checks across{" "}
            <span className="text-foreground">SEO</span>, <span className="text-foreground">tracking</span>,{" "}
            <span className="text-foreground">AI-readiness</span> and{" "}
            <span className="text-foreground">tech</span> - then hands you a 0-100 grade, a prioritized fix
            list, and a chat you can ask about the site.
          </p>

          <form id="audit-form" onSubmit={onSubmit} className="mt-9 w-full max-w-md">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/70 p-2 shadow-2xl shadow-black/40 transition focus-within:border-accent/70">
              <input
                type="text"
                inputMode="url"
                required
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="enter a domain, e.g. example.com"
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground/80"
                aria-label="Domain to audit"
              />
              <button
                type="submit"
                disabled={!canSubmit}
                className="shrink-0 rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Starting…" : "Grade my site →"}
              </button>
            </div>

          </form>

          {/* ---------- 2. EXAMPLE CHIPS ---------- */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Try</span>
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setDomain(e)}
                className="rounded-full border border-border px-2.5 py-1 transition hover:border-accent/60 hover:text-foreground"
              >
                {e}
              </button>
            ))}
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <p className="mt-6 text-xs text-muted-foreground/80">
            58 checks - results in ~2 minutes - no SEO jargon
          </p>
        </section>

        {/* ---------- 3. HOW IT WORKS ---------- */}
        <section id="how-it-works" className="mx-auto w-full max-w-5xl px-6 py-16">
          <SectionHeading
            eyebrow="How it works"
            title="From a domain to a graded report in three steps"
            intro="No setup, no tracking pixels to install, no account verification. You paste a URL and read the answer."
          />
          <ol className="mt-12 grid gap-4 sm:grid-cols-3">
            {STEPS.map(([num, title, body]) => (
              <li key={num} className="surface flex flex-col p-6 text-left">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-sm font-semibold text-accent">
                  {num}
                </span>
                <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- 4. WHAT YOU GET / SAMPLE ---------- */}
        <section className="mx-auto w-full max-w-5xl px-6 py-16">
          <SectionHeading
            eyebrow="What you get"
            title="A report you can actually act on"
            intro="One overall grade, four sub-scores, an executive summary, a fix-ranked action plan, a transparent per-criterion checklist, and a chat grounded in the site's real pages. Here is what a finished report looks like."
          />

          <div className="mx-auto mt-12 max-w-3xl">
            <div className="surface overflow-hidden p-6 shadow-2xl shadow-black/40 sm:p-8">
              {/* fake browser chrome */}
              <div className="mb-6 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-border" />
                <span className="h-2.5 w-2.5 rounded-full bg-border" />
                <span className="h-2.5 w-2.5 rounded-full bg-border" />
                <span className="ml-3 truncate text-xs text-muted-foreground">
                  site-iq report - example.com
                </span>
              </div>

              {/* gauge + sub-scores */}
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
                <MockGauge grade="B" score={84} />
                <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
                  <SubScoreChip label="SEO" value={88} />
                  <SubScoreChip label="Tracking" value={71} />
                  <SubScoreChip label="AI / GEO" value={86} />
                  <SubScoreChip label="Tech" value={92} />
                </div>
              </div>

              {/* executive summary */}
              <div className="mt-6 rounded-xl border border-border bg-background/40 p-4 text-left">
                <div className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                  Executive summary
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Strong technical and SEO foundations across the 6 pages crawled. The biggest opportunity is
                  AI-readiness: adding FAQ schema would help the site surface in AI answers. Tracking reads
                  lower because consent signals could not be confirmed from the crawled HTML.
                </p>
              </div>

              {/* fix-ranked action plan */}
              <div className="mt-6 text-left">
                <div className="mb-2 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                  Fix-ranked action plan
                </div>
                <div className="space-y-2">
                  <FindingRow
                    impact="High"
                    title="Add FAQ structured data (JSON-LD)"
                    detail="No FAQ schema found. Adding it is the single biggest AI-readiness win for the least effort."
                  />
                  <FindingRow
                    impact="Medium"
                    title="Confirm Consent Mode v2 signals"
                    detail="ad_user_data / ad_personalization were not detected in the page source. Verify your tag manager sets them."
                  />
                </div>
              </div>

              {/* chat bubble */}
              <div className="mt-6 rounded-xl border border-border bg-background/40 p-4 text-left">
                <div className="mb-3 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                  Ask the report
                </div>
                <div className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm text-accent-foreground">
                    Does this site have a pricing page?
                  </p>
                </div>
                <div className="mt-2 flex justify-start">
                  <p className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                    Yes - it links to a pricing page from the main navigation, with three tiers described.
                    The answer is drawn only from this report&apos;s crawled pages.
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground/70">
              Illustrative preview. Your report is generated from your site&apos;s real pages.{" "}
              <Link href="/sample" className="text-accent underline underline-offset-2 hover:opacity-80">
                See a full sample report →
              </Link>
            </p>
          </div>
        </section>

        {/* ---------- 5. THE FOUR DIMENSIONS ---------- */}
        <section className="mx-auto w-full max-w-5xl px-6 py-16">
          <SectionHeading
            eyebrow="What we score"
            title="Four dimensions, one honest grade"
            intro="Each dimension is weighted into the overall score. We lead with AI-readiness because it is where most sites - and most other audit tools - fall short."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {DIMENSIONS.map((d) => (
              <div key={d.name} className="surface flex flex-col p-6 text-left">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">{d.name}</span>
                  <span className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {d.weight} of score
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold leading-snug text-foreground">{d.headline}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- 6. WHY SITE IQ ---------- */}
        <section className="mx-auto w-full max-w-5xl px-6 py-16">
          <SectionHeading
            eyebrow="Why Site IQ"
            title="Not another speed score. Not an AI guess."
            intro="Lighthouse grades performance. Ahrefs and Screaming Frog are deep SEO suites. Site IQ is the fast first-look that ties four dimensions into one defensible grade - then lets you interrogate it."
          />

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            <div className="surface p-6 text-left">
              <h3 className="text-base font-semibold text-foreground">One grade across four dimensions</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                SEO, tracking and consent, AI-readiness, and tech in a single 0-100 score - not four
                disconnected dashboards you have to reconcile yourself.
              </p>
            </div>
            <div className="surface p-6 text-left">
              <h3 className="text-base font-semibold text-foreground">Deterministic and defensible</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Same site, same score. The grade comes from 58 explicit rules, not an AI guess - and every
                criterion is shown so you can see exactly why you got the number.
              </p>
            </div>
            <div className="surface p-6 text-left">
              <h3 className="text-base font-semibold text-foreground">A chat grounded in your pages</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Ask &quot;what does this site sell?&quot; or &quot;is there a pricing page?&quot; and get
                answers drawn only from the pages we actually crawled - scoped to your report.
              </p>
            </div>
            <div className="surface p-6 text-left">
              <h3 className="text-base font-semibold text-foreground">Built for AI search and plain English</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                A first-class GEO score for AI answer engines, and a report that explains itself - no jargon,
                no decoder ring. It complements Ahrefs and Screaming Frog rather than replacing them.
              </p>
            </div>
          </div>

          {/* compact comparison */}
          <div className="mx-auto mt-8 max-w-2xl overflow-hidden rounded-2xl border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">How Site IQ compares to common tools</caption>
              <thead>
                <tr className="border-b border-border bg-card/60 text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Capability</th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">Site IQ</th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">Lighthouse</th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">Ahrefs</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {([
                  ["One combined grade across SEO + tracking + GEO + tech", true, false, false],
                  ["AI-readiness / GEO score", true, "partial", "partial"],
                  ["Consent Mode v2 / tracking-tag check", true, false, false],
                  ["Chat grounded in the site's crawled pages", true, false, false],
                  ["Deep backlink / keyword research", false, false, true],
                ] as [string, ...(boolean | "partial")[]][]).map(([label, ...cells]) => (
                  <tr key={label} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="px-4 py-3 font-normal text-foreground">
                      {label}
                    </th>
                    {cells.map((v, i) => (
                      <td key={i} className="px-4 py-3 text-center">
                        {v === "partial" ? (
                          <span className="text-amber-700 dark:text-amber-400/90">Partial</span>
                        ) : v ? (
                          <span className="text-accent">Yes</span>
                        ) : (
                          <span className="text-muted-foreground/50">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground/70">
            &quot;Partial&quot; - Lighthouse 13.3 added an experimental <code>llms.txt</code> check and Ahrefs
            offers AI-visibility scoring (Brand Radar) as a separate product; neither grades AI-readiness
            inside one combined site audit the way Site IQ does.
          </p>
        </section>

        {/* ---------- 7. FAQ ---------- */}
        <section className="mx-auto w-full max-w-3xl px-6 py-16">
          <SectionHeading eyebrow="FAQ" title="Questions, answered honestly" />
          <div className="mt-10 space-y-3">
            <Faq question="Is the score guessed by an AI?">
              No. The 0-100 score is computed by 58 deterministic rules - things like &quot;does the page have
              a title between 15 and 60 characters?&quot;, &quot;is there a canonical tag?&quot;, &quot;is
              HTTPS enabled?&quot; The same site always gets the same score. AI only writes the plain-English
              summary and answers your chat questions; it never decides the grade.
            </Faq>
            <Faq question="Who can see my report, and is my data safe?">
              Your reports are private to your account. The browser only ever sees your own data, enforced at
              the database level. See our{" "}
              <Link href="/privacy" className="text-accent underline-offset-2 hover:underline">
                privacy policy
              </Link>{" "}
              for the details.
            </Faq>
            <Faq question="Why might a great site score lower on tracking?">
              Many sites load their analytics and consent tags at runtime through a tag manager (like Google
              Tag Manager). A crawler reads the page source and cannot always see tags that are injected later,
              so we report tracking conservatively and never let an unconfirmed tracking gap drag down your
              overall grade.
            </Faq>
            <Faq question="How many pages do you crawl?">
              Up to 10 pages per site. We start from the homepage, read robots.txt and the sitemap, and crawl
              the most important pages - enough for a representative snapshot in about two minutes.
            </Faq>
            <Faq question="Do I need to install or verify anything?">
              No. There is nothing to install, no DNS record to add, and no tracking snippet to embed. You
              paste a domain and we do the rest.
            </Faq>
            <Faq question="How is this different from Lighthouse or Ahrefs?">
              Lighthouse measures performance and accessibility on a single page. Ahrefs and Screaming Frog
              are deep, paid SEO suites. Site IQ is a fast first-look that combines SEO, tracking and consent,
              AI-readiness, and tech into one honest grade with a chat - ideal before you dive into a heavier
              tool, not a replacement for one.
            </Faq>
          </div>
        </section>

        {/* ---------- 8. FINAL CTA ---------- */}
        <section className="mx-auto w-full max-w-5xl px-6 py-20">
          <div className="surface flex flex-col items-center gap-6 px-6 py-12 text-center sm:px-12">
            <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Grade any website in minutes.
            </h2>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
              58 objective checks, a 0-100 grade, a prioritized fix list, and a chat over the site&apos;s real
              pages. Create a free account and run your first audit in about two minutes.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="rounded-xl bg-accent px-6 py-3 font-medium text-accent-foreground transition hover:opacity-90"
              >
                Create a free account →
              </Link>
              <a
                href="#audit-form"
                className="rounded-xl border border-border px-6 py-3 font-medium text-foreground transition hover:border-accent/60"
              >
                Grade a site now
              </a>
            </div>
            <p className="text-xs text-muted-foreground/80">
              58 checks - results in ~2 minutes - no SEO jargon
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
