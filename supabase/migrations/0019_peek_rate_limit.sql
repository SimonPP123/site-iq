-- 0019_peek_rate_limit.sql
-- Read-only peek at a rate-limit counter, so the GLOBAL daily audit cap can be enforced as a GATE
-- (read the current count on the way in) WITHOUT consuming a slot. The slot is then consumed
-- (check_rate_limit, migration 0014) only after an audit actually starts, so rejected attempts (user at
-- their monthly quota) and failed ones (report insert / n8n webhook failure) never erode the global
-- ceiling for everyone. Returns the current count within the active window, or 0 if the row is absent or
-- the window has expired. STABLE + SECURITY DEFINER with a pinned empty search_path (hijack-resistant),
-- service-role-only (the app calls it via the service client), mirroring check_rate_limit.
create or replace function public.peek_rate_limit(p_key text, p_window_ms bigint)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select count from public.rate_limits
       where key = p_key
         and window_start >= now() - make_interval(secs => p_window_ms / 1000.0)),
    0);
$$;

revoke all on function public.peek_rate_limit(text, bigint) from public, anon, authenticated;
grant execute on function public.peek_rate_limit(text, bigint) to service_role;
