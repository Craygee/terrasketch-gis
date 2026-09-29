-- Deployment step only AFTER migration, function, permissions, and source-term review.
-- Provision PARCEL_JOB_SECRET on the Edge Function and the same random secret in Vault
-- named landdraft_parcel_job_secret. Store the exact project function URL in Vault
-- named landdraft_parcel_job_url. Never paste secret values into this file.
-- Deploy parcel-cache with JWT verification disabled: its dedicated secret is checked
-- by the handler. It does not accept user actions; those use authenticated database RPCs.
-- pg_cron and pg_net must already be enabled by the operator.
select cron.schedule('landdraft-parcel-cache-dispatch', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='landdraft_parcel_job_url'),
    headers := jsonb_build_object('Content-Type','application/json','x-parcel-job-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='landdraft_parcel_job_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
-- Dispatcher takes one due project at a time; each opted-in project is due weekly.
-- Failed weekly checks retry next day. Leases prevent concurrent publication.
-- Kill switch: update public.parcel_cache_policy set enabled=false;
-- Stop dispatch: select cron.unschedule('landdraft-parcel-cache-dispatch');
