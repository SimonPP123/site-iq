-- documents RLS used (metadata->>'report_id')::uuid, which THROWS "invalid input syntax for type
-- uuid" if any single service-role n8n write ever stored a missing/empty/non-UUID report_id - a user
-- SELECT/DELETE scanning that row would 500 the whole RAG path (report view, chat, history, delete)
-- for everyone. Compare as TEXT instead so an untrusted metadata value can never be cast to uuid.
-- reports is tiny per-user, so the loss of the uuid PK index in the EXISTS is negligible.
drop policy if exists documents_select_own on public.documents;
create policy documents_select_own on public.documents
  for select to public
  using (exists (
    select 1 from public.reports r
    where r.id::text = documents.metadata->>'report_id'
      and r.user_id = (select auth.uid())));

drop policy if exists documents_delete_own on public.documents;
create policy documents_delete_own on public.documents
  for delete to public
  using (exists (
    select 1 from public.reports r
    where r.id::text = documents.metadata->>'report_id'
      and r.user_id = (select auth.uid())));
