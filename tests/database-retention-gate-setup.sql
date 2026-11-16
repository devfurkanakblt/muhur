-- Plan 5 · 0021 önkoşulu (test veritabanı): head admin okuyucu sürümünü ve kuru koşum özetini onaylar.
select confirm_archive_readers('18000000-0000-0000-0000-000000000001','head','{"events":0,"objects":0,"note":"test"}','Test: okuyucular yeni sürümde');
