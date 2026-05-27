# Site IQ - Architecture

## Principle: the app is thin, n8n is the engine

The Next.js app does three things: take input, trigger the pipeline, and render results. All crawling,
analysis, scoring and (soon) AI synthesis happen in **n8n on n8n Cloud**. This keeps the app small and
typed, and makes the automation layer independently inspectable and reusable.

## End-to-end flow

```mermaid
sequenceDiagram
  participant U as Browser
  participant API as /api/audit (Next.js)
  participant N as n8n (Site IQ - Audit)
  participant FC as Firecrawl v2
  participant DB as Supabase

  U->>API: POST { domain }
  API->>DB: insert reports row (status=queued, user_id=auth.uid())
  API->>N: POST webhook { reportId, rootUrl, domain } (X-SIS-Secret)
  N-->>API: 202 Accepted (~1s)
  API-->>U: { reportId } → redirect /audit/[id]
  N->>DB: update reports status=crawling
  N->>FC: POST /v2/batch/scrape (submit job; markdown, html, rawHtml, links)
  N->>FC: GET /v2/batch/scrape/{id} (poll until completed)
  FC-->>N: page content + metadata
  N->>N: run 58 deterministic checks → score
  N->>DB: update reports { status=done, score_overall, result }
  U->>DB: Realtime subscribe (audit_steps + reports)
  DB-->>U: live progress → final report
```

## App ⇄ n8n ⇄ Supabase contract

- **Trigger (app → n8n):** `POST {N8N_AUDIT_WEBHOOK_URL}` with header `X-SIS-Secret` (n8n Header-Auth
  credential) and body `{ reportId, rootUrl, domain }`. `reportId` is pre-created by the app, so the run is
  idempotent and the app already knows where the result will land.
- **Result (n8n → app):** n8n writes to Supabase with the **service-role** key (server-side, bypasses RLS).
  The app never receives a callback; it reads the result + live `audit_steps` via **Realtime** under RLS.
- **Auth boundary:** browser = anon key + RLS (`reports.user_id = auth.uid()`, `audit_steps`/`documents`
  scoped transitively). service-role lives only in n8n's credential, never in the browser bundle.

## Data model (`supabase/migrations/0001_init_site_iq.sql`)

| Table | Purpose |
|---|---|
| `reports` | one row per audit: domain, status, `score_overall`, `result` (jsonb), error |
| `audit_steps` | per-step progress; the Realtime source the UI subscribes to |
| `documents` | chat RAG corpus (pgvector, HNSW) + `match_documents` RPC for retrieval |

RLS is owner-scoped; Realtime `postgres_changes` are filtered by `report_id` for efficiency and gated by
the SELECT policy for security.

## The audit (deterministic)

`src/lib/audit/`:
- `types.ts` - `CrawledPage`, `CheckResult`, `DimensionResult`, `AuditResult`.
- `checks.ts` - `runChecks(pages, rootUrl)`: 58 pure checks → `CheckResult[]` (ratio 0..1, `null` = N/A).
- `scoring.ts` - per-dimension weighted score with **N/A renormalization**, weighted overall
  (SEO 30 / Tracking 25 / GEO 25 / Tech 20), A-F grade, and the **critical-failure floor**.

Detection scans `rawHtml + rendered html`, so GTM-injected and hard-coded tags both count. Count-based
checks (one H1) use rendered html only. The n8n "Run checks" / "Score" Code nodes are a verbatim port of
`checks.ts` / `scoring.ts` - both are exercised by the same logic, the TS side is unit-tested.

## n8n workflow A - "Site IQ - Audit" (live on monkata)

`Webhook(headerAuth, 202)` → `Normalize (Code)` → `Respond 202` → `Mark crawling (Supabase)`
→ `Firecrawl Map (HTTP Request, Bearer)` → `Pick URLs (Code)` → `Batch submit (HTTP Request, Bearer, async /v2/batch/scrape)`
→ `Batch poll (HTTP Request, Bearer, GET until completed)` → `Run checks (Code)` → `Score (Code)`
→ `AI Summary (LLM Chain, gpt-5.4-mini + gpt-5-mini fallback)` → `Merge summary (Code)`
→ `Write result (Supabase)` → `Embed pages (Supabase Vector Store insert)`.

Built reproducibly by `n8n-workflows/build_audit_workflow.py`; deployed via the n8n REST API.

- **Multi-page:** `/map` returns the site's URLs; `Pick URLs` keeps a same-domain sample (up to 10, homepage
  first); the sample is scraped in one async batch job (`/v2/batch/scrape`: submit → poll until completed →
  explode pages) and the checks aggregate as pass-coverage across the sample (`pagesSampled` is recorded).
- **AI executive summary:** an LLM-Chain node (gpt-5.4-mini, with a gpt-5-mini fallback) sees **only** the
  structured scores + failing checks - never raw HTML - so the prose is cheap and low-hallucination. It's
  non-blocking (`onError: continueRegularOutput`): if the model is unavailable the report still ships, just
  without prose.
- **RAG ingestion (tail):** after the result is written, the scraped pages are embedded into pgvector via the
  native LangChain stack - `Embed pages (Vector Store insert)` ← `Default Data Loader` (← `Recursive Text
  Splitter`) + `Embeddings OpenAI (text-embedding-3-small)`; `metadata = { report_id, url, title }`.
  Non-blocking, so a failed embed never blocks the report.
- **Error path:** every node that could leave the report non-terminal (`Mark crawling`, `Pick URLs`,
  `Batch submit`, `Batch poll`, `Run checks`, `Score`, `Merge summary`, `Write result`) routes its error output
  to a `Mark error` node that sets `reports.status='error'`. `Run checks` also throws when nothing usable was
  scraped (unreachable / bot-blocked site) rather than emitting a misleading all-zero report. The UI carries a
  staleness fallback as a final guard. (A `Normalize` failure is handled by the app: the webhook returns
  non-2xx before `Respond 202`, and `/api/audit` marks the report `error`.)

> **Firecrawl note:** the verified community node restricts its credential from HTTP-Request-style use when
> deployed via API, so the workflow calls the documented Firecrawl **v2 REST API** directly via the HTTP
> Request node with a Bearer credential - fully under our control, and the exact API surface. The sampled URLs
> go through the **async `/v2/batch/scrape`** endpoint (submit one job, then poll `/v2/batch/scrape/{id}` until
> `completed`), not the per-URL `/v2/scrape`, which fails with `document_antibot` on this workload.

## n8n workflow B - "Site IQ - Chat" (live on monkata)

`Chat webhook(headerAuth)` → `AI Agent (gpt-5.4-mini + gpt-5-mini fallback)` → `Respond`. The agent has the **Supabase Vector
Store** as a `retrieve-as-tool` (← `Embeddings OpenAI`), filtered to `metadata.report_id`, so a chat can only
ever retrieve the pages of the report it names - the same boundary the `documents` RLS policy enforces in the
browser. The app's `/api/chat` confirms the caller owns the report (RLS) and that it's `done`, then forwards
`{ reportId, message }` with the `X-SIS-Secret` header; the agent answers synchronously.

Built reproducibly by `n8n-workflows/build_chat_workflow.py`; validated via the n8n-MCP validator.

## n8n workflow C - "Site IQ - Auth Emails" (live on monkata)

Supabase's **Send Email Hook** posts every auth email (signup confirmation, password reset, magic link,
email change) to this workflow's webhook with a Standard-Webhooks HMAC signature. The workflow verifies
the signature against the `SUPABASE_SEND_EMAIL_HOOK_SECRET` n8n variable (rejecting unsigned calls with
`401`), renders the right message for the email type, and sends it via **Gmail** - so auth mail routes
through n8n + Gmail instead of Supabase's throttled default mailer. It is opt-in: dormant until the
Supabase hook is enabled (see `docs/DEPLOYMENT.md` step 6). Built reproducibly by
`n8n-workflows/build_auth_email_workflow.py`.

## Operational hardening (cross-cutting)

- **Rate limiting** is Postgres-backed (migration `0014`, `check_rate_limit` RPC) so it holds across all
  serverless instances; per-user **and** per-IP on the expensive paths, with a `GLOBAL_DAILY_AUDIT_CAP`
  circuit-breaker and `AUDITS_ENABLED` / `CHAT_ENABLED` kill-switches.
- **Data retention** (migration `0015`): a daily `pg_cron` purge drops reports + crawled documents older
  than 90 days and contact leads older than a year, honouring the privacy policy.
- **SSRF defense-in-depth:** `/api/audit` refuses domains that resolve to private/reserved IPs, and the
  n8n `Normalize` node repeats the check server-side.

## Roadmap (not yet built)

- A **performance signal** for Tech Basics - ideally a PageSpeed Insights / CrUX API call (real Core Web
  Vitals); the current checks use only static CWV-hygiene proxies (TB6, TB19, TB20).
- **Off-page / SERP signals** (brand mentions, AI Overview citations) - these need an external SERP API, so
  they are reported as not-verifiable from a crawl rather than scored.

(The robots.txt / sitemap / AI-crawler-access checks listed here in earlier drafts are now implemented as
TB5, S14 and G9.)
