-- Canlıya kendiliğinden uygulanmaz. Süreli arşiv silme cron'u: teslim/mühür ve e-posta cron'larından bağımsız.
-- Önkoşul: 0020 + okuyucu yayını + gerçek kuru koşum raporu + 0021 + kullanıcıdan açık onay + head admin
-- set_archive_retention(true). Ayar kapalıyken çağrı yan etkisizdir; bu dosyayı önceden kurmak silme açmaz.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname='muhur-arsiv-saklama';
select cron.schedule('muhur-arsiv-saklama','*/10 * * * *',$$
 select net.http_get(
  url:=rtrim((select decrypted_secret from vault.decrypted_secrets where name='muhur_site_url'),'/')||'/api/cron/archive-expiry',
  headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='muhur_cron_secret')),
  timeout_milliseconds:=55000
 );
$$);
-- Acil durdurma: head admin set_archive_retention(false) (yeni claim durur). Cron'u kaldırmak:
-- select cron.unschedule(jobid) from cron.job where jobname='muhur-arsiv-saklama';
-- Kapatmak daha önce silinen dosyaları geri getirmez; defter ve mühür kanıtı korunur.
