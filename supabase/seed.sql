-- Local / CI seed. Runs after every migration on `supabase db reset` (locally and in the CI
-- "Migration Check" job). Production data lives only in the managed project; this file exists so the
-- migration-replay job exercises the seed path, and so future local-stack E2E runs get a deterministic
-- starting point. Keep it idempotent and free of real PII.
--
-- Intentionally minimal today: every app table is either owner-scoped (it needs a real auth.users row,
-- which we deliberately do not fabricate here) or a lead capture we don't want to pollute. When the
-- local-stack E2E gate is turned on, add its fixtures (a seeded auth user + a finished sample report)
-- below this line.
select 'site-iq seed: migrations applied cleanly, no fixtures yet' as note;
