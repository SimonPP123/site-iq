-- 0016: bound the vector-search RPC so it can never return an unbounded result set.
--
-- match_documents (0001) ran `limit match_count`, and match_count defaults to NULL = "no limit". The n8n
-- chat node always passes a small topK (~10), but the RPC is reachable by `authenticated` (0012), so a
-- crafted call with a huge or NULL match_count could pull the entire documents table for a report -
-- wasted work + memory. Cap it: default to 10 when unset, hard-ceiling at 50. Same SECURITY INVOKER
-- definition (RLS on documents still scopes results to the caller); signature unchanged so the n8n
-- Supabase Vector Store node (queryName = match_documents) keeps working as-is.
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
  limit least(coalesce(match_count, 10), 50);
end; $$;

-- create-or-replace preserves the existing ACL, but re-assert the 0012 lockdown so this migration is
-- self-contained and a fresh replay lands in the locked-down state.
revoke all on function public.match_documents(vector, int, jsonb) from public, anon;
grant execute on function public.match_documents(vector, int, jsonb) to authenticated, service_role;
