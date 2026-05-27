-- Contact / sales requests from the public /contact form (Pro & Agency plan enquiries, general
-- contact). Public form: anyone may INSERT; nobody may read through the anon/authenticated API -
-- only the service role (admin/server) can read them. This guarantees a lead is never lost even
-- if transactional email is not configured.

create table if not exists public.contact_requests (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text not null,
  plan        text,                                  -- 'pro' | 'agency' | null (general enquiry)
  message     text not null,
  handled     boolean not null default false
);

create index if not exists contact_requests_created_at_idx on public.contact_requests (created_at desc);

alter table public.contact_requests enable row level security;

-- Anyone (including unauthenticated visitors) may submit the contact form.
drop policy if exists contact_requests_insert on public.contact_requests;
create policy contact_requests_insert on public.contact_requests
  for insert to anon, authenticated with check (true);

-- No SELECT/UPDATE/DELETE policy on purpose: rows are readable only via the service role (bypasses RLS).
