# Site IQ - Walkthrough

A guide to the non-obvious choices and the reasoning behind them. Each item: what it is and why.

## 1. Why is n8n the engine instead of doing it all in the app?

The app stays thin and typed; all crawling/analysis/AI lives in n8n. That makes the automation independently
inspectable, reusable, and swappable, and demonstrates real n8n integration (webhook trigger, async work,
DB write-back) rather than a monolith.
- **"Why not just call Firecrawl + run checks in a Next.js route?"** You could - but keeping the automation
  in n8n keeps it independently inspectable, reusable, and swappable. n8n also gives durable async execution, retries, and an audit trail for free; the app
  just triggers and renders.

## 2. The scoring engine (`src/lib/audit/scoring.ts`)

Pure, deterministic, unit-tested. Per-dimension = weighted sum of check ratios over **applicable** checks
(N/A checks are renormalized out so a site is never penalized for an inapplicable check, e.g. hreflang on a
mono-locale site). Overall = `0.30·SEO + 0.25·Tracking + 0.25·GEO + 0.20·Tech`.
- **Critical-failure floor:** a hard-failing critical check caps its dimension at 59 (max D) and drops the
  overall one grade below the math. **"Why?"** A site with otherwise-strong SEO but a `noindex` homepage,
  no HTTPS, or no mobile viewport must not surface as a "B". This single rule is what makes the grade
  trustworthy. (F is already the bottom, so it isn't floored further - see the `mathGrade !== 'F'` guard.)
- **Why isn't a tracking gap a floor trigger?** Deliberate. GA4 / Consent-Mode / CMP are routinely injected
  by GTM at runtime, so their *absence* from a single static scrape doesn't prove they're missing. We refuse
  to collapse a headline grade on a signal we can't measure with confidence - e.g. a static crawl of
  `stripe.com` under-detects its GTM-managed tags, and flooring it to "F" would be wrong and not credible.
  So tracking checks are weighted heavily (they tank the Tracking dimension and top the action plan) but are
  `high`, not `critical`. The floor is reserved for what a crawl reads reliably: `noindex`, HTTPS, viewport.
- **"Where's the test for the floor?"** `scoring.test.ts` asserts a critical fail caps the dimension at 59
  and downgrades the overall.

## 3. The checks (`src/lib/audit/checks.ts`) - and why they're mirrored in n8n

`runChecks` is pure TypeScript returning `CheckResult[]`. The n8n "Run checks" Code node is a 1:1 port.
- **"Why duplicate the logic?"** n8n Code nodes are sandboxed and can't import the app's modules. So the TS
  is the tested source of truth and the node mirrors it verbatim. The TS side has 16 unit tests over real
  HTML fixtures (a well-built page and a broken one).
- **Detection scans `rawHtml + rendered html`.** **"Why both?"** Firecrawl's `html` is cleaned/main-content
  and drops head scripts; tracking tags (GA4/GTM) live in the head. Scanning `rawHtml` too means hard-coded
  *and* GTM-injected tags are detected. Count-based checks (exactly one H1) use rendered html only, to avoid
  double-counting across the two layers.
- **Honest limitation:** GTM-managed tags that fire only at runtime (GA4/consent gated behind GTM) may not
  appear in a single scrape, so a heavily-GTM site can read low on T1/T5 even when it has them. The report
  states this scope caveat - that honesty is what separates a credible audit from a toy.

## 4. Firecrawl via the HTTP Request node, not the community node

The verified Firecrawl community node is declarative; deployed via the API, n8n flags its credential as
"configured to prevent use within an HTTP Request node." Rather than fight that, the workflow calls the
documented **Firecrawl v2 REST API** via the standard HTTP Request node with a generic Bearer credential. The
sampled URLs go through the **async batch endpoint** (`POST /v2/batch/scrape` to submit one job, then poll
`GET /v2/batch/scrape/{id}` until `completed`), not the per-URL `POST /v2/scrape` - the per-URL endpoint fails
with `document_antibot` on this workload, while the batch job runs Firecrawl's own concurrency + retry and
returns all pages reliably.
- **"Why not the vendor SDK?"** n8n Code/HTTP nodes favor the built-in HTTP layer (no extra runtime deps,
  smaller supply-chain surface, exact control of the request). The v2 body uses `formats` as **objects**
  (`{type:'markdown'}`), a v1→v2 gotcha that trips copy-pasted examples.

## 5. SSR auth (`src/lib/supabase/*`, `src/proxy.ts`)

- **`proxy.ts`, not `middleware.ts`** - Next.js 16 renamed it; it runs on the Node runtime. Bonus: native
  `crypto` for the foundation's HMAC webhook receiver.
- **`@supabase/ssr` `getAll`/`setAll`** - the only non-deprecated cookie API in 0.10.
- **`getClaims()` for trust, never `getSession()`** - `getSession` reads cookies without verifying; `getClaims`
  validates the JWT. And no code runs between `createServerClient` and `getClaims()` (a classic source of
  random session drops).

## 6. The security boundary (RLS + service-role)

Browser uses the **anon key** and is always under RLS (`reports.user_id = auth.uid()`; `audit_steps`/
`documents` scoped transitively via `report_id`). n8n writes with the **service-role key**, which bypasses
RLS and lives only in n8n's credential - never `NEXT_PUBLIC_*`, never in the client bundle.
- **"How is Realtime multi-tenant-safe?"** Postgres-changes are delivered under the table's SELECT policy per
  subscriber; the `report_id` filter is for efficiency, the RLS policy is the boundary.

## 7. Trigger security & idempotency

The webhook is protected by a Header-Auth shared secret (`X-SIS-Secret`). The app pre-creates the `reports`
row, so its id is the idempotency key and the result destination is known up front. `responseMode:
responseNode` returns `202` in ~1s; the heavy work continues asynchronously.

## 8. Determinism

Every check and the scoring are rule-based - re-running an audit yields identical scores. The only stochastic
parts are the executive-summary prose and the RAG chat answers; neither feeds the score, and the summary only
ever sees the *structured* results (never raw HTML), to keep it cheap and low-hallucination.

## 9. RAG chat over the report (workflow B)

After an audit, the crawled pages are embedded into pgvector (`documents`, `text-embedding-3-small`, 1536-dim).
Chat is a second workflow: an **AI Agent** with the Supabase Vector Store as a `retrieve-as-tool`.
- **"Why an agent + retrieve-as-tool, not a hand-rolled embed→match→LLM?"** The agent decides *when* and *with
  what query* to search, can refine, and cites sources - and it's the idiomatic n8n RAG surface. The schema was
  built to the LangChain/Supabase quickstart contract (`match_documents(query_embedding, match_count, filter)`),
  so the node works as-is.
- **Tenant isolation is the load-bearing detail.** The tool's metadata filter pins `report_id`, so retrieval
  can only ever touch the named report's chunks. That's defense-in-depth with two more layers: `/api/chat`
  rejects a `reportId` the caller doesn't own (RLS), and the `documents` RLS policy scopes reads by `report_id`.
- **"How do ingest and query stay in the same vector space?"** Both Embeddings nodes pin the *same* model
  (`text-embedding-3-small`); a mismatch would silently wreck similarity.

## 10. Trust the tools, then verify - the quality pass

The rubric was validated by an SEO/GEO review (it caught that the consent check didn't detect Consent Mode
**v2** - `ad_user_data` + `ad_personalization` - now check T6). The n8n workflows were checked with the
n8n-MCP validator. The Supabase advisors were run on the live schema and their findings fixed in migration
`0002` (pinned `search_path`; `(select auth.uid())` so RLS evaluates once per query, not per row). A code-review
pass caught a real regression - the shared `validateRedirect` allow-list excluded `/audit`, so post-login users
landed on `/admin` instead of their report; fixed with a test. Lesson worth keeping: an automated quality pass
earns its keep - each pass caught a real issue worth fixing.

## 11. Project layout

`src/lib/audit/` holds the typed engine (checks + scoring), `src/app/` the routes and report UI,
`n8n-workflows/` the workflow generators, and `supabase/migrations/` the schema. `docs/ARCHITECTURE.md`
maps how they fit together.
