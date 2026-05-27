-- 0018: a service-role RPC to refund a consumed audit credit when no report row exists to drive the
-- status->'error' refund trigger. /api/audit consumes a credit (consume_audit_credit) BEFORE inserting
-- the reports row; if that insert fails, the credit was taken but the trigger (0008/0012) can never fire
-- (it keys off a reports.status transition, and there is no row). This RPC lets the route refund directly.
-- Mirrors the trigger's greatest(count-1, 0) floor. SECURITY DEFINER + service_role-only (the route calls
-- it with the service client), so a normal user can never call it to inflate their own quota.
create or replace function public.refund_audit_credit(p_user uuid, p_period text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.audit_usage
     set count = greatest(count - 1, 0), updated_at = now()
   where user_id = p_user and period = p_period;
end; $$;

revoke all on function public.refund_audit_credit(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_audit_credit(uuid, text) to service_role;
