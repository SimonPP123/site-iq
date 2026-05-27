# Deploying Site IQ to a subdomain (e.g. `siteiq.monkata.ai`)

**TL;DR:** host the app on **Vercel** and point a **GoDaddy CNAME** at it. GoDaddy is only your DNS - it
can't run a Next.js server - so Vercel runs the app and GoDaddy just sends the subdomain there. The n8n
workflows already live on `your-instance.app.n8n.cloud` and are publicly reachable, so they work unchanged from a
deployed app. **Is it required?** No - the GitHub repo + a local `npm run dev` is enough. But a live URL
is nicer to share, and it's ~20 minutes of setup.

---

## Why Vercel
Site IQ uses Next.js 16 server features - `proxy.ts` (middleware), server components, and the `/api/audit`
+ `/api/chat` route handlers. Those need a Node host. **Vercel** is the first-party host for Next.js and
handles all of it with zero config. (GoDaddy shared hosting cannot run this; GoDaddy is used only for DNS.)

## Steps

### 1. Connect the repo to Vercel
- Sign in to **vercel.com** with the GitHub account that owns `SimonPP123/site-intelligence-studio`.
- **Add New → Project →** import the repo. Framework preset auto-detects **Next.js**. Don't deploy yet -
  set the environment variables first (next step).

### 2. Set environment variables in Vercel
Project → **Settings → Environment Variables** (scope: Production + Preview). Use the same values that are
in your local `.env.local`:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public (safe in the browser; RLS protects the data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only secret** - never prefix with `NEXT_PUBLIC_` |
| `N8N_AUDIT_WEBHOOK_URL` | `https://your-instance.app.n8n.cloud/webhook/site-audit` |
| `N8N_CHAT_WEBHOOK_URL` | `https://your-instance.app.n8n.cloud/webhook/site-chat` |
| `SIS_WEBHOOK_SECRET` | **secret** - must match the n8n "Site IQ Webhook Secret" credential |
| `NEXT_PUBLIC_APP_URL` | `https://siteiq.monkata.ai` (the final URL) |

Optional: `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_ORG` / `SENTRY_PROJECT` to upload source maps) for error
tracking; `N8N_CONTACT_WEBHOOK_URL` (route contact + transactional email through n8n -> Gmail) and/or
`RESEND_API_KEY` / `EMAIL_FROM` + `CONTACT_EMAIL` for email; `GLOBAL_DAILY_AUDIT_CAP` to hard-cap total
audits/day across all users; `AUDITS_ENABLED` / `CHAT_ENABLED` kill-switches. **Rate limiting is
Postgres-backed** (migration `0014`, the `check_rate_limit` RPC) - shared across all serverless
instances, so there is **no Upstash/Redis** to provision. Then **Deploy** - you'll get a working
`…vercel.app` URL to smoke-test before wiring the domain.

### 3. Add the subdomain in Vercel
Project → **Settings → Domains → Add** → `siteiq.monkata.ai`. Vercel shows the DNS record to create - it
will be a **CNAME** pointing to something like `cname.vercel-dns.com` (copy the exact value Vercel gives you).

### 4. Add the DNS record in GoDaddy
GoDaddy → your `monkata.ai` domain → **DNS → Add record**:
- **Type:** `CNAME`
- **Name/Host:** `siteiq`
- **Value/Points to:** the `cname.vercel-dns.com` target Vercel showed in step 3
- **TTL:** default (1 hour)

Save. DNS usually propagates in minutes (up to an hour). Vercel auto-issues the HTTPS certificate once it
sees the record.

### 5. Tell Supabase Auth about the new URL
Supabase dashboard → **Authentication → URL Configuration**:
- **Site URL:** `https://siteiq.monkata.ai`
- **Redirect URLs:** add `https://siteiq.monkata.ai/**`

Otherwise login/redirect will only work on `localhost`.

### 6. (Recommended) two Supabase toggles
- **Authentication → Policies / Password →** enable **"Leaked password protection"** (checks passwords
  against HaveIBeenPwned). This is the one advisor item that can't be set from code.
- **Authentication → Hooks → Send Email Hook →** enable, type **HTTPS**, URI
  `https://your-instance.app.n8n.cloud/webhook/site-iq-auth-email`, **Generate secret**, and paste that secret
  into the n8n variable `SUPABASE_SEND_EMAIL_HOOK_SECRET`. This routes confirmation / reset / magic-link
  emails through the n8n "Site IQ - Auth Emails" workflow (-> Gmail) instead of the throttled default
  mailer. Leave it off and auth emails fall back to the default mailer (fine for low volume).

### 7. n8n - nothing to change
The webhooks are already public and header-auth-protected. They accept calls from the Vercel app exactly as
they do from local. (If you ever rotate the `SIS_WEBHOOK_SECRET`, update it in **both** Vercel and the n8n
"Site IQ Webhook Secret" credential.)

---

## Demo access
A public, no-signup **sample report** lives at **`/sample`** (also linked from the landing page): the real
report UI rendered from canned data, so anyone sees the product instantly. Sign-up is **open and free**,
so visitors can also run a real audit of their own site (RLS scopes every report to its owner). You can also
pre-create a user in Supabase → **Authentication → Users**.

---

## Ops runbook

Day-2 operations. Most levers are in the Vercel + Supabase + n8n dashboards; the code is already
defensive (rate limits, caps, kill-switches, an n8n error sink).

### Pause an expensive path (incident / cost spike)
- **Stop all audits:** set `AUDITS_ENABLED=false` in **Vercel → Settings → Environment Variables**, then
  **Redeploy** (no code change; ~1-2 min). `/api/audit` then returns `503` and nothing reaches n8n /
  Firecrawl / OpenAI. `CHAT_ENABLED=false` does the same for chat.
- **Throttle without stopping:** lower `GLOBAL_DAILY_AUDIT_CAP` (e.g. to `50`). The cap is enforced via
  the Postgres limiter, so a *reduction* takes effect on the next request after redeploy.
- **Vercel backstop:** **Settings → Spend Management** → set a budget + auto-pause; **Firewall** →
  enable Bot Protection challenge and (Pro) a rate-limit rule on `/api/audit`.
- **Upstream caps:** set spend limits in the **Firecrawl** and **OpenAI** dashboards so a runaway can
  never exceed a known ceiling regardless of app state.

### When something breaks - where to look
| Symptom | First check |
|---|---|
| Audits fail / stuck on "crawling" | **n8n → Executions** for the "Site IQ - Audit" run; the watchdog (migration `0013`) flips genuinely stuck reports to `error`. |
| Report shows but chat says "nothing found" | n8n audit run's **embed** tail (OpenAI 429 leaves the corpus empty); re-run the audit. |
| Auth / reset emails not arriving | If the Send Email Hook is on, **n8n → "Site IQ - Auth Emails"** executions; else Supabase **Auth → Email** logs. |
| 5xx / errors spiking | **Sentry** (issues + traces) and **Vercel → Deployments → Logs**. |
| "Is the app up?" | `GET /api/health` (liveness) and `GET /api/health?ready` (also pings Supabase; `503` = DB down). The **Post-Deploy Smoke** GitHub Action runs these automatically after each Vercel deploy. |
| DB-level question | **Supabase → Logs** + **Advisors** (run `get_advisors` after any schema change). |

### Releasing & rolling back
- **Deploy:** merge to `main` → Vercel auto-deploys → the **Post-Deploy Smoke** Action verifies the live
  URL. CI (`ci-success`) gates lint, typecheck, build, unit tests, **migration replay**, and **secret
  scan** before merge.
- **Roll back app code:** **Vercel → Deployments →** promote the previous good deployment (instant), or
  `git revert` and push.
- **Roll back a migration:** migrations are forward-only - write a new `00NN_*.sql` that undoes the change
  (don't edit a shipped migration) and apply it via the Supabase MCP / dashboard.
- **Roll back an n8n workflow:** rebuild from the Python builder in `n8n-workflows/` and `PUT` it, or use
  n8n's built-in workflow version history.

## Backups & recovery
- **Schema:** fully reproducible from `supabase/migrations/*.sql` (in git) - the source of truth. The CI
  "Migration Check" job replays them all on a clean local stack on every push.
- **Data:** `reports`, `audit_steps`, `documents`, `chat_messages`, `contact_requests`. By design these
  self-expire (migration `0015`: a daily `pg_cron` purge drops reports + crawled documents older than 90
  days and contact leads older than a year), so long-term retention need is low.
- **Point-in-time recovery:** **not available on the Supabase Free tier.** Before Site IQ holds anything
  business-critical, upgrade to Pro and enable **PITR** (Supabase → Database → Backups). Until then,
  recovery = re-apply migrations to a fresh project; user-generated audit data is treated as
  reproducible (a user can simply re-run an audit).

## Prerequisites
1. A **Vercel account linked to GitHub** (the import + env setup is mostly clicking through the UI).
2. **DNS access** (e.g. GoDaddy) to add the one CNAME from step 4 - the exact value appears once Vercel
   shows it.
Those two steps need account access; everything else is in this repo.
