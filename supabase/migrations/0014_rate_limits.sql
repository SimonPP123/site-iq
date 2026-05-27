-- 0014_rate_limits.sql
-- Postgres-backed rate limiting, shared across all serverless instances. Replaces the per-instance
-- in-memory limiter that silently does not hold on Vercel (each lambda has its own Map). The app
-- calls check_rate_limit() via the service-role client. NOTE: this is burst control, not the sole
-- cost ceiling - spend is independently capped by the per-account monthly quota (consume_audit_credit,
-- migration 0007) and the global daily cap the app enforces by calling this function with a 24h window.

create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- No policies on purpose: only the service-role key (which bypasses RLS) may read/write this table.
-- Clients (anon/authenticated) have no access.

-- Atomic fixed-window counter. Returns whether the request is allowed, the remaining budget, and the
-- ms until the window resets. SECURITY DEFINER with a pinned empty search_path (hijack-resistant).
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_ms bigint)
returns table(allowed boolean, remaining integer, reset_ms bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_window interval := make_interval(secs => p_window_ms / 1000.0);
  v_count integer;
  v_start timestamptz;
begin
  insert into public.rate_limits as r (key, count, window_start)
    values (p_key, 1, v_now)
  on conflict (key) do update set
    count = case when r.window_start < v_now - v_window then 1 else r.count + 1 end,
    window_start = case when r.window_start < v_now - v_window then v_now else r.window_start end
  returning r.count, r.window_start into v_count, v_start;

  return query select
    (v_count <= p_limit),
    greatest(0, p_limit - v_count),
    (extract(epoch from ((v_start + v_window) - v_now)) * 1000)::bigint;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, bigint) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, bigint) to service_role;

-- Hourly cleanup of stale rows (pg_cron is already used by migration 0013). Idempotent reschedule.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'siteiq-rate-limits-cleanup') then
      perform cron.unschedule('siteiq-rate-limits-cleanup');
    end if;
    perform cron.schedule('siteiq-rate-limits-cleanup', '17 * * * *',
      $job$ delete from public.rate_limits where window_start < now() - interval '1 day'; $job$);
  end if;
end $$;
