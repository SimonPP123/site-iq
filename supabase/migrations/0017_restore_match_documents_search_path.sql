-- 0017: restore the pinned search_path on match_documents.
-- Regression fix: 0016 (the retrieval cap) did CREATE OR REPLACE without repeating the
-- `set search_path = public, extensions` that 0002 had pinned (lint 0011), silently dropping it and
-- re-opening the Supabase advisor `function_search_path_mutable`. Re-create with BOTH the cap and the
-- pin. SECURITY INVOKER + signature unchanged, so the n8n Vector Store node (queryName = match_documents)
-- keeps working as-is.
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
  limit least(coalesce(match_count, 10), 50);
end; $$;

revoke all on function public.match_documents(vector, int, jsonb) from public, anon;
grant execute on function public.match_documents(vector, int, jsonb) to authenticated, service_role;
