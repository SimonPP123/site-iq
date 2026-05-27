-- 0001_init_site_iq.sql
-- Site Intelligence Studio - initial schema.
-- reports + audit_steps (live progress) + documents (chat RAG corpus) + pgvector + RLS + Realtime.
-- Created: 2026-05-23.

-- pgvector lives in the `extensions` schema on Supabase.
create extension if not exists vector with schema extensions;

-- =========================================================================
-- reports : one row per audit (the app pre-creates it = idempotency key)
-- =========================================================================
create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade default auth.uid(),
  domain           text not null,
  root_url         text,
  status           text not null default 'queued'
                     check (status in ('queued','crawling','analyzing','embedding','done','error')),
  score_overall    int  check (score_overall between 0 and 100),
  result           jsonb,            -- full structured audit result from the n8n synthesis
  n8n_execution_id text,             -- watchdog link to the n8n run
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists reports_user_id_idx    on public.reports(user_id);
create index if not exists reports_created_at_idx  on public.reports(created_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists reports_touch on public.reports;
create trigger reports_touch before update on public.reports
  for each row execute function public.touch_updated_at();

-- =========================================================================
-- audit_steps : per-step progress; the Realtime source the UI subscribes to
-- =========================================================================
create table if not exists public.audit_steps (
  id          bigserial primary key,
  report_id   uuid not null references public.reports(id) on delete cascade,
  step        text not null,        -- crawl | seo | tracking | geo | tech | synthesis | embeddings
  status      text not null default 'running' check (status in ('running','done','error')),
  progress    int  not null default 0 check (progress between 0 and 100),
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_steps_report_id_idx on public.audit_steps(report_id);

-- =========================================================================
-- documents : chat RAG corpus. Shape matches the LangChain / Supabase
-- Vector Store quickstart so the n8n "Supabase Vector Store" node works as-is.
-- =========================================================================
create table if not exists public.documents (
  id         bigserial primary key,
  content    text,
  metadata   jsonb,                  -- { report_id, url, title } - filtered at retrieval
  embedding  vector(1536)            -- text-embedding-3-small
);

-- HNSW: builds on an empty table and stays optimal under incremental inserts (Supabase default < 1M rows).
create index if not exists documents_embedding_hnsw_idx
  on public.documents using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
-- Accelerates the `metadata @> filter` containment used for per-report (report_id) isolation.
create index if not exists documents_metadata_gin_idx on public.documents using gin (metadata);

-- match_documents : EXACT LangChain/Supabase quickstart signature. The n8n Vector Store
-- node calls this by name (queryName = match_documents); do not rename.
create or replace function public.match_documents (
  query_embedding vector(1536),
  match_count int default null,
  filter jsonb default '{}'
) returns table (id bigint, content text, metadata jsonb, similarity float)
language plpgsql as $$
#variable_conflict use_column
begin
  return query
  select id, content, metadata,
         1 - (documents.embedding <=> query_embedding) as similarity
  from public.documents
  where metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end; $$;

-- =========================================================================
-- Row Level Security
--   Browser uses the anon key and is ALWAYS subject to RLS.
--   n8n writes with the service_role key, which BYPASSES RLS (server-side only).
--   So end users get read-only owner-scoped access; only n8n writes steps/documents.
-- =========================================================================
alter table public.reports     enable row level security;
alter table public.audit_steps enable row level security;
alter table public.documents   enable row level security;

create policy reports_select_own on public.reports
  for select using (auth.uid() = user_id);
create policy reports_insert_own on public.reports
  for insert with check (auth.uid() = user_id);
create policy reports_update_own on public.reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- This SELECT policy also scopes Realtime postgres_changes for audit_steps.
create policy audit_steps_select_own on public.audit_steps
  for select using (
    exists (select 1 from public.reports r
            where r.id = audit_steps.report_id and r.user_id = auth.uid())
  );

create policy documents_select_own on public.documents
  for select using (
    exists (select 1 from public.reports r
            where r.id = (documents.metadata->>'report_id')::uuid and r.user_id = auth.uid())
  );

-- =========================================================================
-- Realtime : the UI subscribes to step progress (and parent status flips).
-- =========================================================================
alter publication supabase_realtime add table public.audit_steps;
alter publication supabase_realtime add table public.reports;
