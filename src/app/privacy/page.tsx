import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Privacy",
  alternates: { canonical: "/privacy" },
};

/** Privacy policy for Site IQ, an EU/Bulgaria-operated SaaS. Plain-language, GDPR-oriented. */
export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="mx-auto w-full max-w-3xl px-6 py-10">
        <article className="prose dark:prose-invert max-w-none prose-headings:tracking-tight prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-th:text-foreground prose-strong:text-foreground">
          <h1>Privacy Policy</h1>
          <p className="lead text-muted-foreground">Last updated: 27 May 2026</p>

          <p>
            This policy explains what personal data Site IQ collects when you use the website
            intelligence service at <strong>siteiq.monkata.ai</strong>, why we collect it, who we
            share it with, and the rights you have under the EU General Data Protection Regulation
            (GDPR).
          </p>

          <h2>1. Who we are</h2>
          <p>
            Site IQ (&quot;we&quot;) is the <em>controller</em> of the personal data described below.
            Site IQ is operated from Bulgaria (EU); our full company registration details are available
            on request. The quickest way to reach us about privacy matters is our{" "}
            <a href="/contact">contact form</a>.
          </p>

          <h2>2. What data we collect</h2>
          <ul>
            <li>
              <strong>Account data</strong> - the email address you sign in with (authentication is
              handled by Supabase).
            </li>
            <li>
              <strong>Audited domains</strong> - the domains and URLs you submit for an audit.
            </li>
            <li>
              <strong>Crawled third-party page content</strong> - the public page content Site IQ
              fetches from the domain you submit (up to 10 pages), used to run the checks and generate
              the summary and chat. This may itself contain personal data if it appears on the audited
              pages.
            </li>
            <li>
              <strong>Embeddings</strong> - numerical vector representations of the crawled content,
              stored so the chat can search the audited pages.
            </li>
            <li>
              <strong>Chat history</strong> - the questions you ask about a report and the AI answers,
              stored with that report.
            </li>
            <li>
              <strong>Logs and technical data</strong> - IP address, timestamps and basic request
              metadata generated automatically when you use the service, kept for security and
              debugging.
            </li>
          </ul>

          <h2>3. How we use it, and our legal bases</h2>
          <ul>
            <li>
              <strong>To perform the audit you requested</strong> - crawling the domain, running the
              58 deterministic checks, producing the score, the AI summary and the chat.{" "}
              <em>Legal basis: performance of a contract</em> (Art. 6(1)(b) GDPR).
            </li>
            <li>
              <strong>To keep the service secure and working</strong> - authentication, abuse
              prevention, debugging and logging.{" "}
              <em>Legal basis: our legitimate interests</em> (Art. 6(1)(f) GDPR) in operating a safe,
              reliable service.
            </li>
            <li>
              <strong>To understand and improve the product</strong> - privacy-friendly, consent-gated
              analytics (Google Analytics 4 via Google Tag Manager) about how the site is used.{" "}
              <em>Legal basis: your consent</em> (Art. 6(1)(a) GDPR). Analytics cookies load only after
              you accept, and you can withdraw at any time (see <a href="#cookies">Cookies</a>).
            </li>
          </ul>
          <p>
            We do <strong>not</strong> use your data for advertising, and we do not sell it.
          </p>

          <h2 id="cookies">4. Cookies and analytics</h2>
          <p>
            <strong>Strictly-necessary cookies.</strong> The session cookies set by Supabase keep you
            signed in. These are essential to provide the service, so they do not require consent. If
            you clear or block them you will be signed out.
          </p>
          <p>
            <strong>Analytics cookies (consent-based).</strong> We use <strong>Google Analytics 4</strong>,
            loaded through <strong>Google Tag Manager</strong>, to understand how Site IQ is used so we
            can improve it. We run <strong>Google Consent Mode v2</strong> with analytics and advertising
            storage <strong>denied by default</strong> in the EU/EEA/UK, so nothing non-essential is set
            until you choose. On your first visit a banner offers <strong>Accept</strong> and{" "}
            <strong>Reject</strong> as equal options, plus a <strong>Manage</strong> panel for
            per-category choices. Analytics cookies are set <strong>only if you accept</strong>.
          </p>
          <p>
            We store your choice in your browser (a <code>siteiq-consent</code> entry and a matching
            cookie) for up to <strong>365 days</strong> so we do not ask on every visit. You can{" "}
            <strong>change or withdraw your choice at any time</strong> using the{" "}
            <strong>Cookie settings</strong> link in the footer, and we honour your browser&apos;s{" "}
            <strong>Global Privacy Control</strong> signal. We do not use advertising cookies and we do
            not sell your data.
          </p>

          <h2>5. Sub-processors</h2>
          <p>
            We rely on a small number of trusted providers to run the service. Each processes personal
            data only on our instructions:
          </p>
          <div className="not-prose my-6 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Purpose</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">Safeguard</th>
                </tr>
              </thead>
              <tbody className="text-foreground/90">
                <tr className="border-b border-border/60">
                  <td className="px-3 py-2 align-top font-medium">Supabase</td>
                  <td className="px-3 py-2 align-top">Database, authentication, vector storage (account email, reports, crawled content, embeddings, chat)</td>
                  <td className="px-3 py-2 align-top">EU (Frankfurt / Ireland)</td>
                  <td className="px-3 py-2 align-top">Data stored in the EU region; Data Processing Agreement</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="px-3 py-2 align-top font-medium">Vercel</td>
                  <td className="px-3 py-2 align-top">Application hosting</td>
                  <td className="px-3 py-2 align-top">EU edge; US company</td>
                  <td className="px-3 py-2 align-top">EU-US Data Privacy Framework (DPF) + SCCs</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="px-3 py-2 align-top font-medium">n8n Cloud</td>
                  <td className="px-3 py-2 align-top">Automation pipeline that runs the audit and chat workflows</td>
                  <td className="px-3 py-2 align-top">EU (Azure)</td>
                  <td className="px-3 py-2 align-top">EU region; Data Processing Agreement</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="px-3 py-2 align-top font-medium">Firecrawl</td>
                  <td className="px-3 py-2 align-top">Crawls the public pages of the domain you submit</td>
                  <td className="px-3 py-2 align-top">United States</td>
                  <td className="px-3 py-2 align-top">Standard Contractual Clauses (SCCs)</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="px-3 py-2 align-top font-medium">OpenAI</td>
                  <td className="px-3 py-2 align-top">Embeddings, the AI summary and the chat answers</td>
                  <td className="px-3 py-2 align-top">United States (EU data residency available on request)</td>
                  <td className="px-3 py-2 align-top">SCCs; EU data residency option</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 align-top font-medium">Google (Analytics 4 / Tag Manager)</td>
                  <td className="px-3 py-2 align-top">Consent-based product analytics, only after you accept. IP anonymised; not used for ads, not sold.</td>
                  <td className="px-3 py-2 align-top">United States</td>
                  <td className="px-3 py-2 align-top">SCCs + EU-US DPF; Consent Mode v2 (denied by default in the EU)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong>Where crawled content goes:</strong> the page content we crawl is sent to{" "}
            <strong>Firecrawl (US)</strong> to fetch it and to <strong>OpenAI (US by default)</strong>{" "}
            to create embeddings and generate the summary and chat answers. Under their API terms,{" "}
            <strong>neither Firecrawl nor OpenAI uses this content to train their models</strong>.
          </p>

          <h2>6. International transfers</h2>
          <p>
            Your account data, reports, crawled content, embeddings and chat history are stored in the
            EU (Supabase, Frankfurt / Ireland). Some processing involves transfers outside the EU/EEA -
            specifically to Firecrawl, OpenAI and (only with your analytics consent) Google in the United States. These transfers are covered by{" "}
            <strong>Standard Contractual Clauses (SCCs)</strong> and, where applicable, the{" "}
            <strong>EU-US Data Privacy Framework</strong> (Vercel). OpenAI also offers{" "}
            <strong>EU data residency on request</strong>, which we can enable for accounts that need
            it.
          </p>

          <h2>7. How long we keep it (retention)</h2>
          <ul>
            <li>
              <strong>Account data</strong> - deleted within <strong>30 days</strong> of you deleting
              your account.
            </li>
            <li>
              <strong>Reports, crawled content and embeddings</strong> - you can delete any individual
              report at any time, and they are automatically purged after{" "}
              <strong>90 days</strong>.
            </li>
            <li>
              <strong>Chat history</strong> - stored with its report and deleted together with that
              report.
            </li>
          </ul>

          <h2>8. Your rights under the GDPR</h2>
          <p>If your personal data is processed, you have the right to:</p>
          <ul>
            <li><strong>Access</strong> - get a copy of the data we hold about you.</li>
            <li><strong>Rectification</strong> - correct inaccurate or incomplete data.</li>
            <li><strong>Erasure</strong> - have your data deleted (&quot;right to be forgotten&quot;).</li>
            <li><strong>Portability</strong> - receive your data in a portable, machine-readable format.</li>
            <li><strong>Objection</strong> - object to processing based on our legitimate interests.</li>
          </ul>
          <p>
            To exercise any of these, contact us through our <a href="/contact">contact form</a>. You also have the
            right to lodge a complaint with your local supervisory authority. In Bulgaria this is the{" "}
            <strong>Commission for Personal Data Protection (CPDP / КЗЛД)</strong> -{" "}
            <a href="https://www.cpdp.bg/" target="_blank" rel="noopener noreferrer">cpdp.bg</a>.
          </p>

          <h2>9. AI disclosure</h2>
          <p>
            The executive <strong>summary and the chat answers are generated by AI</strong> (OpenAI
            models). In line with the <strong>EU AI Act&apos;s transparency requirements</strong>, we make this clear:
            AI-generated output can be incomplete or wrong, the score itself is computed by deterministic
            rules rather than AI, and you should not treat any AI output as professional advice.
          </p>

          <h2>10. How we handle crawled third-party content</h2>
          <p>
            When you submit a domain, we crawl its public pages <strong>solely to produce the audit you
            requested</strong> - to run the checks, build the embeddings, and power the summary and chat
            for that report. We do not use the crawled content for any other purpose.
          </p>
          <p>
            <strong>You warrant that you are authorized to submit each domain or URL</strong> - that you
            either own it or have the owner&apos;s permission to have it audited. See our{" "}
            <Link href="/terms">Terms &amp; acceptable use</Link> for details.
          </p>

          <h2>11. Security</h2>
          <ul>
            <li>All traffic is served over <strong>HTTPS</strong>.</li>
            <li>Data is <strong>encrypted at rest</strong> in our EU database.</li>
            <li>
              <strong>Row Level Security (RLS)</strong> enforces tenant isolation, so each account can
              only ever access its own reports and chat.
            </li>
            <li>We do <strong>not</strong> sell your data.</li>
          </ul>

          <h2>12. Contact and effective date</h2>
          <p>
            Questions about this policy or your data? Reach us any time through our{" "}
            <a href="/contact">contact form</a>. This policy is
            effective as of <strong>May 2026</strong>. If we make material changes we will update the
            &quot;Last updated&quot; date above and, where appropriate, notify you.
          </p>
        </article>
      </main>
    </div>
  );
}
