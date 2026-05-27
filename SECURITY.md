# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in Site IQ, please report it **privately** - do not open a public issue.

- **Preferred:** open a private advisory via GitHub Security Advisories ("Report a vulnerability" on this repository's **Security** tab).
- **Alternatively:** use the contact form at <https://siteiq.monkata.ai/contact> and set the topic to security.

Please include steps to reproduce, the impact, and any proof-of-concept. We aim to acknowledge reports within a few business days and will keep you updated on remediation. Please allow a reasonable window to fix the issue before any public disclosure.

## Scope

**In scope:** the Site IQ web app (siteiq.monkata.ai) and this repository's code. The audit engine deliberately fetches and analyzes third-party websites that users submit, so reports about how the crawler handles hostile input (SSRF, redirect pivots, oversized or malicious responses) are especially welcome.

**Out of scope:** findings in the third-party services we build on (Supabase, Vercel, n8n, OpenAI, Firecrawl) - please report those to the respective vendor.

## Hardening already in place

- The crawler refuses private / loopback / link-local / cloud-metadata addresses and does not follow redirects on auxiliary fetches (SSRF defense-in-depth, app-side and n8n-side).
- Rate limiting (per user and per IP), per-account quotas, and a global daily cap bound automated abuse and third-party spend.
- All report data is owner-scoped via PostgreSQL row-level security; the admin area is allowlist-gated in middleware and re-checked in-page.
- Secrets are never committed; transactional email and audit results flow over authenticated webhooks.
