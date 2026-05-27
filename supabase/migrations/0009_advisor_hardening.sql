-- Security (advisor 0028/0029): the refund function is invoked by a trigger only; it must not be
-- callable directly via the public PostgREST RPC endpoint. Revoke EXECUTE from the API roles.
-- (The AFTER UPDATE trigger still fires; trigger execution does not depend on this grant.)
revoke execute on function public.refund_audit_credit_on_error() from anon, authenticated;

-- Performance (advisor 0003): wrap auth.uid() in a scalar subselect so the planner evaluates it once
-- per statement instead of once per row. Same semantics (a user sees only their own usage row).
alter policy audit_usage_select_own on public.audit_usage using ((select auth.uid()) = user_id);
