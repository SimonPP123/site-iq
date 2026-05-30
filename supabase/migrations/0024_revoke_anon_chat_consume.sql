-- Least-privilege hygiene: drop the leftover anon EXECUTE grant on consume_chat_message.
--
-- 0023 created the function with `revoke all ... from public; grant execute ... to authenticated,
-- service_role;` but the live ACL drifted to also include `anon` (Supabase advisor 0028:
-- anon_security_definer_function_executable). This is NOT exploitable - the SECURITY DEFINER body
-- returns 0 immediately when auth.uid() is null, and again when the report is not owned by the
-- caller, and hard-caps the limit - so anon (and non-owners) can do nothing. The route only ever
-- calls it as an authenticated user. Revoke anyway so the live grant matches source intent and the
-- advisor clears. Idempotent (revoke of an absent grant is a no-op).
revoke execute on function public.consume_chat_message(uuid, text, integer) from anon;
