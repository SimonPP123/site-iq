-- 0002_harden_rls_and_functions.sql
-- Hardening from the Supabase advisors (security + performance lints), 2026-05-23:
--   * SECURITY: pin a non-mutable search_path on our functions (lint 0011).
--   * PERFORMANCE: wrap auth.uid() in a scalar subselect so it's evaluated once per query
--     instead of once per row in every RLS policy (lint 0003, auth_rls_initplan).
-- Re-runnable: functions use CREATE OR REPLACE; policies are dropped + recreated.

-- ---- SECURITY: stable search_path on our functions ----
-- touch_updated_at references nothing schema-bound, so the empty path is safe.
create or replace function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

-- match_documents needs `public` (the documents table) and `extensions` (the pgvector `<=>`
-- operator) on the path; pinning it explicitly satisfies the linter and keeps resolution stable.
create or replace function public.match_documents (
  query_embedding vector(1536),
  match_count int default null,
  filter jsonb default '{}'
) returns table (id bigint, content text, metadata jsonb, similarity float)
language plpgsql
set search_path = public, extensions
as $$
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

-- ---- PERFORMANCE: (select auth.uid()) is evaluated once, not per row ----
drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select using ((select auth.uid()) = user_id);

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists reports_update_own on public.reports;
create policy reports_update_own on public.reports
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists audit_steps_select_own on public.audit_steps;
create policy audit_steps_select_own on public.audit_steps
  for select using (
    exists (select 1 from public.reports r
            where r.id = audit_steps.report_id and r.user_id = (select auth.uid()))
  );

drop policy if exists documents_select_own on public.documents;
create policy documents_select_own on public.documents
  for select using (
    exists (select 1 from public.reports r
            where r.id = (documents.metadata->>'report_id')::uuid and r.user_id = (select auth.uid()))
  );
