-- 0015_data_retention_purge.sql
-- Honour the privacy policy's retention promise with a daily pg_cron purge: delete reports older
-- than 90 days (cascades to audit_steps + chat_messages) and their crawled documents (no FK to
-- reports -> matched by metadata->>report_id), plus contact-form leads older than a year.
-- Pre-launch there is no >90-day data, so this is a no-op until data ages in. Idempotent reschedule.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'siteiq-purge-old-data') then
      perform cron.unschedule('siteiq-purge-old-data');
    end if;
    perform cron.schedule('siteiq-purge-old-data', '30 3 * * *', $job$
      delete from public.documents d
        where (d.metadata->>'report_id')::uuid in
          (select id from public.reports where created_at < now() - interval '90 days');
      delete from public.reports where created_at < now() - interval '90 days';
      delete from public.contact_requests where created_at < now() - interval '365 days';
    $job$);
  end if;
end $$;
