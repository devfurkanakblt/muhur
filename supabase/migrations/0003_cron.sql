-- Dakikalık zamanlayıcı. Anahtar Supabase Vault'ta "muhur_cron_secret" adıyla tutulur (Vercel'deki CRON_SECRET ile aynı);
-- bu dosyada anahtar yoktur. Anahtarı yazmak için: select vault.create_secret('<CRON_SECRET>', 'muhur_cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'muhur-tick';
select cron.schedule(
  'muhur-tick',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://muhur-phi.vercel.app/api/cron/tick',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'muhur_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
