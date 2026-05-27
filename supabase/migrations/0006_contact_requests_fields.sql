-- Richer contact form: optional company + a topic/reason so submissions are easier to triage.
alter table public.contact_requests add column if not exists company text;
alter table public.contact_requests add column if not exists topic text;
