-- The 0015 nightly retention purge still filtered documents with (metadata->>'report_id')::uuid -
-- the exact cast 0020 replaced in the RLS because a single malformed/empty/non-UUID report_id throws
-- "invalid input syntax for type uuid", aborting the whole purge transaction (documents + reports +
-- contact_requests run in one $job$), silently breaking the 90-day GDPR retention promise. Reschedule
-- the cron to compare as TEXT (join to reports), mirroring 0020. Idempotent (unschedule + reschedule).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'siteiq-purge-old-data') then
      perform cron.unschedule('siteiq-purge-old-data');
    end if;
    perform cron.schedule('siteiq-purge-old-data', '30 3 * * *', $job$
      delete from public.documents d
        using public.reports r
        where r.id::text = d.metadata->>'report_id'
          and r.created_at < now() - interval '90 days';
      delete from public.reports where created_at < now() - interval '90 days';
      delete from public.contact_requests where created_at < now() - interval '365 days';
    $job$);
  end if;
end $$;
