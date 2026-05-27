-- The public contact form persists leads via the anon role (POST /api/contact, server client).
-- The previous policy used WITH CHECK (true), which let anyone hit PostgREST directly with the
-- public anon key and insert arbitrary/oversized rows, bypassing the route's zod validation, and
-- even pre-mark a row handled=true to hide it from the admin inbox.
--
-- Tighten it to the invariants the route already guarantees. Length caps sit ABOVE the route's
-- zod limits (name<=100, email<=200, message<=2000, company<=120, topic<=60) so a legitimate
-- route insert is never rejected; this is a backstop, not a duplicate validator. handled=false
-- matches the column default the route relies on, so anon can no longer insert a pre-handled row.
alter policy contact_requests_insert on public.contact_requests
with check (
  handled = false
  and char_length(name) between 1 and 200
  and char_length(email) between 3 and 320
  and char_length(message) between 1 and 5000
  and (company is null or char_length(company) <= 200)
  and (topic is null or char_length(topic) <= 100)
  and (plan is null or char_length(plan) <= 50)
);
