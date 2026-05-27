import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Terms",
  alternates: { canonical: "/terms" },
};

/**
 * Terms of Service / Acceptable Use for Site IQ (siteiq.monkata.ai), an EU/Bulgaria-owned SaaS.
 * Plain-language template. Entity, address and contact details are placeholders the owner MUST
 * fill in, and the whole document needs a qualified EU/Bulgarian lawyer to review it before it is
 * relied on. The acceptable-use / authorization section is load-bearing for a crawling product.
 */
export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="mx-auto w-full max-w-3xl px-6 py-10">
        <article className="prose dark:prose-invert max-w-none prose-headings:tracking-tight prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground">
          <h1>Terms of Service &amp; Acceptable Use</h1>
          <p className="lead text-muted-foreground">Last updated: May 2026</p>

          <p>
            These terms govern your use of Site IQ, the website intelligence service at{" "}
            <strong>siteiq.monkata.ai</strong>, operated from Bulgaria (EU); our full company
            registration details are available on request. &quot;We&quot;, &quot;us&quot;
            and &quot;Site IQ&quot; mean the operator of the service; &quot;you&quot; means the
            account holder using the service.
          </p>

          <h2>1. Acceptance</h2>
          <p>
            By creating an account or using Site IQ, you agree to these terms and to our{" "}
            <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not use the service.
          </p>

          <h2>2. What the service does</h2>
          <p>
            You enter a domain; Site IQ crawls up to 10 of its public pages, runs 58 deterministic
            checks, computes a score, and produces an AI-written summary and an AI chat you can ask
            about that site. Please understand its nature and limits:
          </p>
          <ul>
            <li>
              The report, score, summary and chat are <strong>informational only - they are not
              professional, legal, compliance or financial advice</strong>.
            </li>
            <li>
              The <strong>AI summary, the chat answers and the score may be imperfect</strong> and
              should be independently verified before you act on them.
            </li>
            <li>
              An audit is a <strong>snapshot of up to 10 pages, not a full-site crawl</strong>, so it
              will not catch site-wide patterns.
            </li>
            <li>
              <strong>Tags and scripts injected at runtime</strong> (for example via a tag manager) may
              not be detectable by a static crawl, so the report may understate what is actually
              present.
            </li>
          </ul>

          <h2>3. Accounts and security</h2>
          <ul>
            <li>You must provide an accurate email address and keep your login credentials confidential.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>Notify us promptly through our <a href="/contact">contact form</a> if you suspect unauthorized use.</li>
          </ul>

          <h2>4. Acceptable use</h2>
          <p>
            <strong>
              You represent and warrant that, for every domain or URL you submit, you either own it or
              have the owner&apos;s authorization to have it audited.
            </strong>{" "}
            This is a condition of using Site IQ. In addition, you agree that you will:
          </p>
          <ul>
            <li>only audit sites you own or are authorized to audit;</li>
            <li>
              not use the service to <strong>overload, attack, probe, or bypass the access controls</strong>{" "}
              of any site or system;
            </li>
            <li>
              respect that Site IQ honours <strong>robots.txt and applies rate limits</strong>, and not
              attempt to circumvent those protections;
            </li>
            <li>
              not <strong>redistribute, resell, or publish the crawled content</strong> of third-party
              sites obtained through the service;
            </li>
            <li>not use the service unlawfully or to infringe anyone&apos;s rights.</li>
          </ul>

          <h2>5. Suspension and termination</h2>
          <p>
            We may suspend or terminate your access immediately if you breach these terms - in
            particular the acceptable-use section above - or if your use threatens the security or
            integrity of the service or of third-party sites. You may stop using the service and delete
            your account at any time.
          </p>

          <h2>6. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless Site IQ from any
            claims, damages, losses or costs (including reasonable legal fees) arising out of: (a) your
            submission of a domain or URL you were <strong>not authorized to scan</strong>; and (b) any{" "}
            <strong>third-party intellectual-property or privacy claim</strong> related to content you
            caused Site IQ to crawl or process.
          </p>

          <h2>7. Intellectual property</h2>
          <ul>
            <li>
              <strong>Our IP:</strong> the Site IQ application, its scoring engine, design, code and
              brand are owned by us and protected by law.
            </li>
            <li>
              <strong>Your inputs:</strong> you keep all rights in the domains, URLs and questions you
              submit. We process them only to provide the service.
            </li>
            <li>
              <strong>Third-party content:</strong> the crawled content of sites you audit belongs to
              its respective owners. It is <strong>not ours</strong>, and we claim no rights in it.
            </li>
          </ul>

          <h2>8. Disclaimers and limitation of liability</h2>
          <p>
            The service is provided <strong>&quot;as is&quot; and &quot;as available&quot;</strong>,
            without warranties of any kind, to the maximum extent permitted by law. We do not warrant
            that the service will be uninterrupted, error-free, or that any score, summary or chat
            answer is accurate or complete.
          </p>
          <p>
            To the maximum extent permitted by law, our total liability arising out of or relating to
            the service is <strong>capped</strong> at the amount you paid us for the service in the 12
            months before the event giving rise to the claim (or, if you use a free tier, a nominal
            amount). We are not liable for indirect, incidental or consequential damages.
          </p>
          <p>
            Nothing in these terms limits or excludes any rights you have as a{" "}
            <strong>consumer under mandatory EU consumer-protection law</strong>, or any liability that
            cannot be excluded by law.
          </p>

          <h2>9. Governing law</h2>
          <p>
            These terms are governed by the laws of the <strong>Republic of Bulgaria</strong>, without
            regard to conflict-of-laws rules, and the courts of Bulgaria have jurisdiction - subject to
            any mandatory consumer-protection rights that entitle you to bring proceedings in your country
            of residence.
          </p>

          <h2>10. Changes and contact</h2>
          <p>
            We may update these terms from time to time. When we make material changes we will update the
            &quot;Last updated&quot; date above and, where appropriate, notify you. Continued use after
            a change means you accept the updated terms.
          </p>
          <p>
            Questions? Reach us any time through our <a href="/contact">contact form</a>.
          </p>
        </article>
      </main>
    </div>
  );
}
