-- 0004_delete_policies.sql
-- Owner-scoped DELETE so a user can remove their own audits from the history page.
-- reports DELETE cascades to audit_steps + chat_messages (FK on delete cascade); documents have no
-- FK (report_id lives in metadata jsonb), so they get their own policy and are deleted first.

create policy reports_delete_own on public.reports
  for delete using ((select auth.uid()) = user_id);

create policy documents_delete_own on public.documents
  for delete using (
    exists (select 1 from public.reports r
            where r.id = (documents.metadata->>'report_id')::uuid and r.user_id = (select auth.uid()))
  );
