-- consume_audit_credit enforced ONLY the caller-supplied p_max, so a signed-in user could call the
-- RPC directly (/rest/v1/rpc/consume_audit_credit?p_max=999999) and the per-account monthly cap
-- would never trip. (In practice a foot-gun more than an exploit - the only audit trigger is
-- /api/audit which passes the server constant 3, and calling the RPC directly only inflates the
-- caller's OWN counter - but the ceiling must never be caller-controlled.) Clamp to a hard
-- server-side ceiling. Keep v_ceiling in sync with FREE_PLAN.auditsPerMonth (src/lib/plan.ts).
create or replace function public.consume_audit_credit(p_max integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_period  text := to_char(timezone('utc', now()), 'YYYY-MM');
  v_ceiling integer := 3;  -- absolute Free monthly cap; mirrors FREE_PLAN.auditsPerMonth
  v_cap     integer := least(coalesce(p_max, v_ceiling), v_ceiling);
  v_count   integer;
begin
  if v_uid is null then
    return -1;
  end if;

  insert into public.audit_usage (user_id, period, count)
  values (v_uid, v_period, 0)
  on conflict (user_id, period) do nothing;

  update public.audit_usage
     set count = count + 1, updated_at = now()
   where user_id = v_uid and period = v_period and count < v_cap
   returning count into v_count;

  return coalesce(v_count, -1);
end;
$function$;
