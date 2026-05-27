import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// OWASP security headers. Declared here (not only in middleware) so Vercel applies them at the
// platform level to EVERY response - including statically-served pages, which middleware headers
// don't reliably reach. This is also what lets siteiq.monkata.ai pass its own TB30-TB35 checks.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    // 'unsafe-eval' removed (Next 16 production does not need eval). script-src still allows
    // 'unsafe-inline' because Next's inline bootstrap + the theme/JSON-LD scripts depend on it;
    // removing that needs per-request nonces threaded through the session middleware (updateSession,
    // which also does auth refresh + route gating) - a careful, preview-tested change tracked separately.
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://api.pwnedpasswords.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  // HSTS only in production (don't pin localhost/preview to HTTPS).
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  // Tree-shake barrel-heavy libraries so only the icons/components actually used are bundled.
  experimental: {
    optimizePackageImports: ["recharts", "react-markdown", "remark-gfm"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Sentry configuration options
const sentryBuildOptions = {
    // Suppresses source map uploading logs during build
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // Upload source maps to Sentry
    widenClientFileUpload: true,
    // Hides source maps from generated client bundles
    hideSourceMaps: true,
    // Automatically tree-shake Sentry logger statements
    disableLogger: true,
};

// Only wrap with Sentry if DSN is configured
const finalConfig = process.env.NEXT_PUBLIC_SENTRY_DSN
    ? withSentryConfig(nextConfig, sentryBuildOptions)
    : nextConfig;

export default finalConfig;
