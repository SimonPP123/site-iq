-- Immutable monthly audit usage so deleting a report cannot refund a free-plan audit credit.
-- (Before this, auditsThisMonth() counted live `reports` rows, so delete + re-create bypassed the cap.)

create table if not exists public.audit_usage (
  user_id    uuid not null references auth.users(id) on delete cascade,
  period     text not null,                 -- 'YYYY-MM' (UTC)
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

alter table public.audit_usage enable row level security;

-- Owner may READ their own usage (drives the /account + /audits usage badge). There are deliberately
-- NO write policies: the table is mutated ONLY through consume_audit_credit() below (SECURITY DEFINER),
-- so a client can never tamper with - or roll back - its own counter.
drop policy if exists "audit_usage_select_own" on public.audit_usage;
create policy "audit_usage_select_own" on public.audit_usage
  for select using (auth.uid() = user_id);

-- Atomically consume one audit credit for the caller's current (UTC) month, enforcing p_max.
-- Returns the new count, or -1 when the cap is already reached. Race-safe: the guarded
-- UPDATE ... RETURNING locks the row, so two concurrent calls can't both slip past the cap.
create or replace function public.consume_audit_credit(p_max integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_period text := to_char(timezone('utc', now()), 'YYYY-MM');
  v_count  integer;
begin
  if v_uid is null then
    return -1;
  end if;

  insert into public.audit_usage (user_id, period, count)
  values (v_uid, v_period, 0)
  on conflict (user_id, period) do nothing;

  update public.audit_usage
     set count = count + 1, updated_at = now()
   where user_id = v_uid and period = v_period and count < p_max
   returning count into v_count;

  return coalesce(v_count, -1);
end;
$$;

revoke all on function public.consume_audit_credit(integer) from public, anon;
grant execute on function public.consume_audit_credit(integer) to authenticated;

-- Backfill from existing reports so current usage carries over (best effort: we can't recover the
-- count of already-deleted reports, but from here on deletion never refunds).
insert into public.audit_usage (user_id, period, count)
select user_id, to_char(timezone('utc', created_at), 'YYYY-MM'), count(*)
from public.reports
where user_id is not null
group by 1, 2
on conflict (user_id, period) do update set count = excluded.count, updated_at = now();
