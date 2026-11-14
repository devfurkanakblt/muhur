-- Canlıya kendiliğinden uygulanmaz. Teslim cron'undan bağımsız, dakikada bir.
-- Vault: muhur_site_url (HTTPS uygulama kökü), muhur_cron_secret (CRON_SECRET ile aynı).
-- Brevo gönderici/alan adı ve webhook doğrulandıktan sonra çalıştırılır.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname='muhur-mail';
select cron.schedule('muhur-mail','* * * * *',$$
 select net.http_get(
  url:=rtrim((select decrypted_secret from vault.decrypted_secrets where name='muhur_site_url'),'/')||'/api/cron/mail',
  headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='muhur_cron_secret')),
  timeout_milliseconds:=30000
 );
$$);
-- Geri alma: select cron.unschedule(jobid) from cron.job where jobname='muhur-mail';
