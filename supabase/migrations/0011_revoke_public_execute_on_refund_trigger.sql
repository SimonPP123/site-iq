-- refund_audit_credit_on_error is a SECURITY DEFINER trigger function (fires AFTER UPDATE OF status
-- ON reports). It was unintentionally executable via PostgREST RPC by anon + authenticated because
-- it still carried the default EXECUTE grant to PUBLIC -- migration 0009's "REVOKE FROM anon,
-- authenticated" was a no-op since the access flowed through PUBLIC, not an explicit role grant.
-- A direct RPC call would error (a RETURNS trigger function can't run outside a trigger), but it
-- should not be exposed at all. Revoke PUBLIC (and the redundant role names); the trigger keeps
-- firing because triggers execute the function regardless of EXECUTE privilege.
revoke execute on function public.refund_audit_credit_on_error() from public, anon, authenticated;
