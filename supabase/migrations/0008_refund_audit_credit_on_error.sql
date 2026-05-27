-- Refund a free-plan audit credit when an audit ends in 'error', so a failed run (an n8n/infra failure,
-- or a site we genuinely could not crawl) never costs the user a credit. Fires on the reports.status
-- transition into 'error' - covers BOTH the synchronous webhook-failure path (the app marks 'error') and
-- the async pipeline-failure path (n8n's "Mark error" node). SECURITY DEFINER so it can write audit_usage
-- (which has no client write policy); the decrement floors at 0 so it can never go negative.

create or replace function public.refund_audit_credit_on_error()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'error' and coalesce(old.status, '') <> 'error' and new.user_id is not null then
    update public.audit_usage
       set count = greatest(count - 1, 0), updated_at = now()
     where user_id = new.user_id
       and period = to_char(timezone('utc', new.created_at), 'YYYY-MM');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refund_audit_credit_on_error on public.reports;
create trigger trg_refund_audit_credit_on_error
  after update of status on public.reports
  for each row
  execute function public.refund_audit_credit_on_error();
