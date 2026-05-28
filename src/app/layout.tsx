import type { Metadata, Viewport } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Footer } from "@/components/Footer";
import { RouteAnnouncer } from "@/components/RouteAnnouncer";
import { ConsentBootstrap } from "@/components/ConsentBootstrap";
import { ConsentBanner } from "@/components/ConsentBanner";

// Body: Inter (clean, legible). Display: Bricolage Grotesque (distinctive, characterful) for headings + wordmark.
const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteiq.monkata.ai";

export const metadata: Metadata = {
    metadataBase: new URL(APP_URL),
    title: {
        default: "Site IQ - Website Intelligence Reports",
        template: "%s | Site IQ",
    },
    description:
        "Score any website's SEO, tracking, AI-readiness (GEO) and tech basics in one report - with a plain-English summary and a chat you can ask about the site.",
    keywords: ["SEO audit", "website audit", "GEO", "AI readiness", "Consent Mode", "Core Web Vitals", "GDPR"],
    authors: [{ name: "Site IQ" }],
    openGraph: {
        title: "Site IQ - Website Intelligence Reports",
        description: "Score a site's SEO, tracking, AI-readiness and tech - with an AI summary and a chat over its pages.",
        url: APP_URL,
        siteName: "Site IQ",
        locale: "en_US",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Site IQ - Website Intelligence Reports",
        description: "Score a site's SEO, tracking, AI-readiness and tech - with an AI summary and a chat over its pages.",
    },
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
    // Google Search Console ownership verification (issued 2026-05-28). Next.js' `verification.google`
    // emits <meta name="google-site-verification" content="..."> in <head> on every route, including the
    // root URL Search Console checks. Safe to leave in place permanently per Google's docs.
    verification: { google: "I7t_CI-d87V2_ISKN-i6okyiEK_uOtYGpSB87lNSCQg" },
};

// Mobile browser chrome colour per theme + a hint that native UI (form controls, scrollbars,
// autofill) should follow the active theme. Set here, not in metadata, per Next 16's split.
export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
        { media: "(prefers-color-scheme: dark)", color: "#08080b" },
    ],
    colorScheme: "light dark",
};

// Site-wide JSON-LD: an Organization + a WebSite, so search and AI engines can resolve
// "Site IQ" to one entity. Kept minimal and valid (no unverifiable sameAs/logo claims).
const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "Organization",
            name: "Site IQ",
            url: APP_URL,
        },
        {
            "@type": "WebSite",
            name: "Site IQ",
            url: APP_URL,
        },
    ],
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                {/* Set the theme class before first paint (no FOUC). Mirrors ThemeProvider's storage key. */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var k='siteiq-theme';var t=localStorage.getItem(k)||'system';var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
                    }}
                />
                {/* Site-wide Organization + WebSite structured data. */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
                {/* Consent Mode v2 default + dataLayer bootstrap, then the GTM loader (in that order).
                    Renders NOTHING unless NEXT_PUBLIC_GTM_ID is set, so dev/preview stays clean. The
                    default-before-loader ordering here is what lets Site IQ pass its own T5/T6/T15/T20
                    tracking checks - see ConsentBootstrap. */}
                <ConsentBootstrap />
            </head>
            <body className={`${inter.variable} ${display.variable} font-sans`}>
                {/* Skip to main content link for accessibility */}
                <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-accent-foreground focus:rounded-lg focus:outline-none"
                >
                    Skip to main content
                </a>
                <RouteAnnouncer />
                <ThemeProvider>
                    {children}
                    <Footer />
                    {/* Single global instance of the in-house cookie-consent banner. Carries the
                        T7-detectable markers (id="cookie-consent" / data-cookieconsent /
                        cookieconsent-banner) and is server-rendered here so a no-JS crawl sees them.
                        Must NOT be added to per-route layouts (avoids double mounts). */}
                    <ConsentBanner />
                </ThemeProvider>
            </body>
        </html>
    );
}
