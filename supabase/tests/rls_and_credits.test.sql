-- DB-level RLS + credit-function regression test (pgTAP).
--
-- Run with the Supabase CLI:  supabase test db
-- (pgTAP ships with the local stack; in CI add a `supabase db start` + `supabase test db` step.)
--
-- WHY THIS EXISTS: cross-tenant isolation and the anti-abuse credit economics live entirely in
-- Postgres (RLS policies + SECURITY DEFINER functions). Route unit tests mock Supabase, so they
-- exercise NONE of the actual SQL/RLS. This is the deterministic regression guard for the two
-- existential properties - a paying tenant must never read another tenant's data, and the credit
-- ceilings must hold. Every assertion below was also verified LIVE against production via the
-- Supabase MCP on 2026-05-28 (the exact seed + set-local-role pattern), so this file encodes
-- known-passing invariants.
--
-- Covers: documents/reports tenant isolation (0001/0002/0004), the 0020 text-compare cast-safety
-- (a malformed metadata.report_id must not 500 a scan), the 0021 consume_audit_credit server-side
-- ceiling clamp, and the 0023 consume_chat_message owner-scoped reservation.

begin;
select plan(12);

-- ---- Seed (runs as the test superuser -> bypasses RLS). Only auth.users.id is NOT NULL. ----
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.reports (id, user_id, domain, status) values
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a.example', 'done'),
  ('b2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b.example', 'done');

insert into public.documents (content, metadata) values
  ('A doc',     '{"report_id":"a1111111-1111-4111-8111-111111111111"}'::jsonb),
  ('B doc',     '{"report_id":"b2222222-2222-4222-8222-222222222222"}'::jsonb),
  ('malformed', '{"report_id":"not-a-uuid"}'::jsonb);   -- the 0020 cast-safety probe

-- ================= Act as user A =================
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select is((select count(*)::int from public.reports   where id = 'a1111111-1111-4111-8111-111111111111'), 1,
  'A sees its own report');
select is((select count(*)::int from public.reports   where id = 'b2222222-2222-4222-8222-222222222222'), 0,
  'RLS: A cannot see user B''s report');
select is((select count(*)::int from public.documents where metadata->>'report_id' = 'a1111111-1111-4111-8111-111111111111'), 1,
  'A sees its own RAG documents');
select is((select count(*)::int from public.documents where metadata->>'report_id' = 'b2222222-2222-4222-8222-222222222222'), 0,
  'RLS: A cannot see user B''s RAG documents (tenant isolation on the chat corpus)');
select lives_ok($$ select count(*) from public.documents $$,
  '0020: a full documents scan does NOT throw on a malformed report_id (text-compare, not ::uuid cast)');

-- 0021: consume_audit_credit clamps the caller-supplied p_max to the server ceiling (3).
select is(public.consume_audit_credit(999999)::int, 1,  '0021: 1st credit consume returns 1 (p_max=999999 clamped)');
select is(public.consume_audit_credit(999999)::int, 2,  '0021: 2nd credit consume returns 2');
select is(public.consume_audit_credit(999999)::int, 3,  '0021: 3rd credit consume returns 3 (at ceiling)');
select is(public.consume_audit_credit(999999)::int, -1, '0021: 4th credit consume returns -1 - caller CANNOT exceed the server ceiling of 3');

-- 0023: consume_chat_message reserves a slot for the owner (returns the new message id > 0).
select ok(public.consume_chat_message('a1111111-1111-4111-8111-111111111111', 'hello', 5) > 0,
  '0023: consume_chat_message reserves a message slot for the report owner');

-- ================= Switch to user B =================
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

select is((select count(*)::int from public.reports where id = 'b2222222-2222-4222-8222-222222222222'), 1,
  'B sees its own report');
select is((select count(*)::int from public.reports where id = 'a1111111-1111-4111-8111-111111111111'), 0,
  'RLS: B cannot see user A''s report (isolation holds both directions)');

select * from finish();
rollback;
