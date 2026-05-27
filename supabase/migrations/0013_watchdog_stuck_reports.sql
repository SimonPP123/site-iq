-- 0013: watchdog for stuck audits (resilience).
--
-- An audit runs asynchronously in n8n and writes its own terminal status ('done'/'error'). But an
-- execution can die OUTSIDE its error path - n8n eviction/OOM, the very first status write failing, or
-- the Firecrawl poll loop hitting the workflow's executionTimeout (which kills the run WITHOUT flipping
-- the report to 'error'). The report then sits in a non-terminal status forever: the client spinner
-- never resolves and, because no 'error' transition fires, the refund trigger never runs, so the user
-- silently loses a credit.
--
-- This pg_cron job is the safety net the schema always implied: every 5 minutes it flips any report
-- still non-terminal after 10 minutes to 'error'. That UPDATE fires refund_audit_credit_on_error
-- (BEFORE UPDATE OF status), so the credit is returned. 10 minutes is well beyond a healthy audit
-- (~2-3 min) and the 300s executionTimeout, so it never races a still-running job.
create extension if not exists pg_cron;

-- Idempotent (re)schedule: drop any prior version of the job, then create it.
do $$
begin
  perform cron.unschedule('siteiq-watchdog-stuck-reports');
exception
  when others then null; -- job did not exist yet
end $$;

select cron.schedule(
  'siteiq-watchdog-stuck-reports',
  '*/5 * * * *',
  $job$
    update public.reports
       set status = 'error',
           error  = coalesce(nullif(error, ''), 'Audit timed out - no result within the expected window')
     where status in ('queued', 'crawling', 'analyzing', 'embedding')
       and created_at < now() - interval '10 minutes'
  $job$
);
