-- 0012: close the self-serve credit-refund hole and lock down the vector-search RPC (pre-launch hardening).
--
-- BACKGROUND. consume_audit_credit (0007) is the only writer that INCREMENTS audit_usage; the refund
-- trigger (0008) DECREMENTS it on a reports.status -> 'error' transition. But reports_update_own (0002)
-- let a client UPDATE its own report with no column restriction, and 'error' is an allowed status value
-- (0001). So an authenticated user could PATCH /rest/v1/reports {"status":"error"} straight through
-- PostgREST, fire the refund trigger, and get the credit back -> unlimited free audits. The app's own
-- error paths now write reports.status with the service-role client (which bypasses RLS), so clients
-- never need UPDATE on reports at all.

-- 1) Clients can no longer UPDATE reports. Status is owned by the backend: the app's /api/audit error
--    paths and the n8n pipeline both write it with the service-role key (RLS-bypassing). The
--    SELECT/INSERT/DELETE-own policies are untouched, so listing, creating and deleting a report still
--    work for the owner.
drop policy if exists reports_update_own on public.reports;

-- 2) Make the refund idempotent: credit back at most once per report, so even a backend status churn
--    (error -> ... -> error) can never double-refund. The trigger becomes BEFORE UPDATE so it can stamp
--    credit_refunded on the row it is already writing (an AFTER trigger cannot modify NEW).
alter table public.reports add column if not exists credit_refunded boolean not null default false;

create or replace function public.refund_audit_credit_on_error()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'error' and coalesce(old.status, '') <> 'error'
     and new.user_id is not null and not coalesce(old.credit_refunded, false) then
    update public.audit_usage
       set count = greatest(count - 1, 0), updated_at = now()
     where user_id = new.user_id
       and period = to_char(timezone('utc', new.created_at), 'YYYY-MM');
    new.credit_refunded := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refund_audit_credit_on_error on public.reports;
create trigger trg_refund_audit_credit_on_error
  before update of status on public.reports
  for each row
  execute function public.refund_audit_credit_on_error();

-- 3) match_documents (the pgvector retrieval RPC) was left on Postgres's default EXECUTE-to-PUBLIC,
--    unlike every other function in this schema. It is SECURITY INVOKER, so RLS on documents still
--    scopes results to the caller - but an unfiltered vector-search RPC should not be reachable by
--    anon at all. Lock it to the roles that actually call it (n8n via service_role; authenticated as
--    defense-in-depth), matching the least-privilege pattern used for consume_audit_credit.
revoke all on function public.match_documents(vector, int, jsonb) from public, anon;
grant execute on function public.match_documents(vector, int, jsonb) to authenticated, service_role;
