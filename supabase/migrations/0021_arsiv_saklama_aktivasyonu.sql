-- Plan 5 · Süreli arşiv silmenin son kapısı. Bu migration KENDİ BAŞINA HİÇBİR DOSYA SİLMEZ ve silmeyi açmaz:
-- yalnız head admin'in (taze oturum + gerekçe) set_archive_retention ile etkinleştirmesine izin verir.
--
-- Önkoşullar (sağlanmazsa migration durur):
--  1. 0020 uygulanmış ve bütün okuyucular (arşiv/jüri/doğrulama) yeni uygulama sürümünde yayında.
--  2. Head admin yeni uygulamadaki platform yönetiminden okuyucu sürümünü ve gerçek kuru koşum özetini onaylamış
--     (confirm_archive_readers). Bu düğme yalnız yeni uygulamada vardır.
--  3. Ayar hâlâ kapalı.
-- Canlı silme açılmadan önce etkinlik/dosya sayısı/manifest özeti kullanıcıya sunulur ve ayrıca açık onay alınır;
-- onay bu dosyanın yazılmış olmasından türetilmez. Kapatmak (set_archive_retention false) silinmiş dosyaları geri getirmez.
begin;

do $$
begin
  if not exists (select 1 from public.archive_retention_settings where id and readers_confirmed_at is not null and dry_run_summary is not null) then
    raise exception '0021: Önce platform yönetiminden okuyucu sürümü ve kuru koşum özeti onaylanmalı (confirm_archive_readers).';
  end if;
  if exists (select 1 from public.archive_retention_settings where id and enabled) then
    raise exception '0021: Süreli silme ayarı beklenmedik şekilde açık; önce kapatılmalı.';
  end if;
  if exists (select 1 from public.archive_expiry_objects where state = 'processing') then
    raise exception '0021: Kirada bekleyen silme nesnesi var; defter tutarsız.';
  end if;
end $$;

create or replace function public.archive_retention_gate_open() returns boolean
language sql stable set search_path = public as $$ select true $$;

commit;
