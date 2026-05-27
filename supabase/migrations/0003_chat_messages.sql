-- 0003_chat_messages.sql
-- Persist chat conversations per report so a user can leave and continue later.
-- Owner-scoped via the parent report (same boundary as documents/audit_steps).

create table if not exists public.chat_messages (
  id          bigserial primary key,
  report_id   uuid not null references public.reports(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_report_idx on public.chat_messages(report_id, id);

alter table public.chat_messages enable row level security;

-- Read/insert only for the owner of the parent report (auth.uid() wrapped per the perf advisor).
create policy chat_messages_select_own on public.chat_messages
  for select using (
    exists (select 1 from public.reports r
            where r.id = chat_messages.report_id and r.user_id = (select auth.uid()))
  );
create policy chat_messages_insert_own on public.chat_messages
  for insert with check (
    exists (select 1 from public.reports r
            where r.id = chat_messages.report_id and r.user_id = (select auth.uid()))
  );
