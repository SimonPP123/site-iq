# Site IQ - Project Overview (full context + build process)

Live: **https://siteiq.monkata.ai** (Vercel) | Repo: `SimonPP123/site-intelligence-studio` (private)
Last updated: 2026-05-25.

Site IQ takes any domain, crawls up to 10 pages, runs **58 deterministic checks** across four
dimensions (SEO, Tracking & Analytics, AI-Readiness/GEO, Tech Basics), computes a 0-100 score + grade,
writes an AI executive summary, and lets you chat with a RAG agent over the crawled pages.

---

## 1. Tech stack

- **Next.js 16** (App Router, `proxy.ts` middleware, React Compiler), **React 19**, **TypeScript 5.9**, **Tailwind v4**, **recharts 3**, **framer-motion**.
- **Supabase**: Postgres + **pgvector** (HNSW), **Realtime** (live progress), **RLS** (owner-scoped), **Auth** (`@supabase/ssr`, cookie sessions).
- **n8n Cloud** (`your-instance.app.n8n.cloud`): two workflows (Audit + Chat) + **Firecrawl v2** (crawl) + **OpenAI** `gpt-5.4-mini` (summary + chat agent, with a `gpt-5-mini` native fallback) + `text-embedding-3-small`.
- **Sentry** (errors), **n8n + Gmail / Resend** (email), **Postgres-backed rate-limit** (migration 0014, in-memory fallback - no Upstash), **Vitest** + **Playwright** + **axe** + **k6** + **Lighthouse CI** (tests), **Vercel** (host).

## 2. File map (by area, one line each)

### App routes - `src/app/`
- `layout.tsx` - root layout (dark, Inter, Footer, skip-link, OG/Twitter metadata).
- `page.tsx` - **landing**: domain form -> `POST /api/audit`; hero, how-it-works, report preview, dimensions, FAQ, CTA. Authorization is fine print (no blocking checkbox).
- `audit/[id]/page.tsx` - report page (server, force-dynamic) -> `ReportView`.
- `audits/page.tsx` - "My audits" history (auth-gated; **last 7 days** on Free).
- `login` / `signup` / `forgot-password` - self-serve auth (Supabase).
- `methodology/page.tsx` - public rubric: the 58 checks + weights + grade bands.
- `pricing/page.tsx` - Free / Pro / Agency (Pro & Agency -> `/contact`; billing not live).
- `contact/page.tsx` + `components/ContactForm.tsx` - public contact/sales form (reads `?plan=`).
- `privacy` / `terms` - GDPR + EU-AI-Act + AUP (entity placeholders to fill).
- `admin/**` - internal dashboard shell (overview, email studio, secrets, users, docs).
- `sample/page.tsx` - public, no-signup **sample report** (real report UI from canned data; linked from the landing + sitemap).
- `sitemap.ts`, `loading.tsx`, `error.tsx`, `global-error.tsx` - infra pages.

### API routes - `src/app/api/`
- `audit/route.ts` - auth + rate-limit + **Free cap (3/mo)** -> create `reports` row -> fire n8n audit webhook (X-SIS-Secret) -> 202.
- `chat/route.ts` - auth + rate-limit + **Free cap (5/audit)** + RLS ownership -> n8n chat webhook -> persist turn -> `{answer}`.
- `contact/route.ts` - public, rate-limited -> insert `contact_requests` (lead never lost) + best-effort Resend email.
- `email/route.ts` - admin transactional send. `health/route.ts` - liveness (+ `?ready` DB probe). `reports/delete/route.ts` - owner delete. `auth/callback/route.ts` - PKCE callback.
- `account/delete/route.ts` + `account/export/route.ts` - **GDPR**: self-serve account erasure (service-role `deleteUser` + purge of the user's `documents`) and a downloadable JSON export of their data.

### Audit engine (the IP) - `src/lib/audit/`
- `checks.ts` - **typed source of truth: 58 deterministic checks.** `runChecks(pages, rootUrl, aux)`; each returns a 0..1 ratio or `null` (N/A). GTM-aware tracking (`anyOrNA`) + security-header checks (TB30-35) read from `aux`.
- `scoring.ts` - weighted per-dimension + overall, critical-failure floor (59), action plan (impact*2-effort).
- `checkInfo.ts` - per-check why/fix/example (non-technical).
- `types.ts` - `CheckResult`, `CrawledPage`, `AuditResult`, etc.
- `checks.test.ts` / `scoring.test.ts` / `parity.test.ts` - unit tests + the n8n drift guard.

### Other lib - `src/lib/`
- `plan.ts` - **Free-plan limits + enforcement helpers** (3 audits/mo, 5 chat/audit, 7-day history).
- `supabase/{client,server,middleware}.ts` - SSR Supabase clients + session refresh + route gating.
- `rate-limit.ts`, `security.ts`, `redirect.ts`, `validations.ts`, `email.ts`, `env.ts` - infra helpers (Zod-validated env, IP rate-limit, error sanitize, open-redirect guard).

### Components - `src/components/`
- `SiteHeader.tsx` - **responsive nav menu** (How it works / What we check / Pricing) + auth state + mobile toggle.
- `Footer.tsx` - Product/Legal/Company nav + AI-disclosure. `report/ReportView.tsx`, `ChatPanel.tsx`, `WhatWeChecked.tsx`, `SiteIqGauge.tsx`, `GaugeCharts.tsx` - the report UI.

### Config + infra
- `next.config.ts` - **security headers (CSP/HSTS/X-Frame-Options/...) via `headers()`** (applied by Vercel to every response), standalone output, React Compiler, Sentry wrap.
- `src/proxy.ts` - middleware: session refresh + `/admin` `/audit` gating (headers live in next.config now).
- `supabase/migrations/0001-0015` - schema + hardening (reports, audit_steps, documents+pgvector, chat_messages, delete policies, **contact_requests**, **audit_usage** credit counter + refund trigger, RLS/advisor hardening, credit-refund lockdown, the stuck-report **watchdog** (0013), the Postgres **rate_limits** table + `check_rate_limit` RPC (0014), and the 90-day **data-retention purge** cron (0015)). `config.toml` + `seed.sql` boot a local stack for the CI migration-replay check.
- `n8n-workflows/build_audit_workflow.py` + `build_chat_workflow.py` - **Python builders that emit the workflow JSON** (deployed via REST PUT). `site-iq-audit.json` / `site-iq-chat.json` - the deployed workflows.
- `tests/` - Playwright E2E (smoke, auth, admin, api, accessibility). `k6/` - load tests. `.github/workflows/` - CI.

## 3. Architecture & data flow

**Audit:** Browser form -> `POST /api/audit` (auth, rate-limit, Free cap) -> insert `reports(status=queued)` -> fire n8n webhook -> **202**. n8n (async, service-role): mark crawling -> Firecrawl map -> pick <=10 URLs -> fetch robots/sitemap/**headers** -> Firecrawl scrape -> **Run checks** (JS port of `checks.ts`) -> **Score** -> embed pages into pgvector -> `gpt-5.4-mini` summary (fallback `gpt-5-mini`) -> write `result` + `status=done`. Browser watches via **Realtime** and renders the report.

**Chat:** `ChatPanel` -> `POST /api/chat` (auth, rate-limit, Free cap, RLS ownership) -> n8n RAG agent (vector store filtered to `report_id`, same embeddings) -> `{answer}` -> persisted to `chat_messages`.

**Auth/isolation:** browser uses the anon key + JWT cookie; **all data is RLS owner-scoped**. n8n uses the service-role key server-side only (the sole writer of results/embeddings). App->n8n is a static shared secret over TLS; n8n never calls back into the app.

**The parity invariant:** `checks.ts`/`scoring.ts` are the typed source of truth; the n8n Code nodes are a hand-maintained 1:1 JavaScript port (the n8n sandbox has no TS/`URL`). **`parity.test.ts`** reads the emitted workflow JSON and fails CI if any check id/dimension/weight, the dimension weights, the critical floor, or the JS validity drifts. This is what keeps the two copies honest.

## 4. The build process / quality bar (how this is built to last)

1. **Discuss -> plan -> approve before coding**; research existing patterns first; reuse over new files.
2. **Single source of truth + drift guards** - the audit logic lives once in typed TS, mirrored to n8n, with a parity test as the tripwire. No silent divergence.
3. **Everything verified before ship:** the merge gate (`ci-success`) requires `tsc` 0, ESLint 0, a clean build, **Vitest** unit tests (incl. parity) green, a **migration replay** on a clean Supabase stack, a blocking **secret scan** (gitleaks), and a **bundle-size budget**. The **Playwright** E2E + **axe** a11y suite is opt-in (it needs a real Supabase project, so it is gated behind `RUN_E2E=true` in CI and runs in the nightly browser matrix); it is run locally before ship but does not gate the merge.
4. **Honest degradation, never fake results:** N/A renormalization (unfetched aux), GTM-aware tracking (don't penalize what a crawl can't verify), graceful AI-summary fallback (`summaryStatus`), an n8n error sink so the UI never hangs.
5. **Security by default:** RLS everywhere, service-role isolation, rate-limits + Free-plan caps, input validation (Zod), OWASP headers, error sanitization. The app passes its own security checks.
6. **Reproducible infra:** n8n workflows are generated from Python (deterministic) and deployed via REST. A **Post-Deploy Smoke** GitHub Action verifies the live URL (home, `/sample`, `/api/health`) after every Vercel deploy; the n8n audit pipeline itself is still verified by hand with a real run after a workflow change.
7. **Observability:** Sentry end-to-end (sampled in prod, PII-masked) + `/api/health` liveness & `?ready` DB probe + n8n execution history + Supabase logs.

## 5. Owed / gated (needs the owner)

- Fill legal placeholders: legal entity, EIK, registered address, contact email (privacy/terms).
- Set `CONTACT_EMAIL` + a verified Resend sender domain so `/contact` emails actually deliver (leads are saved to `contact_requests` regardless).
- Decide on anonymous try-before-signup + Stripe billing; rotate keys as needed.
