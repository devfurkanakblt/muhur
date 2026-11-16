-- Plan 5 · 0021 sonrası: kapı açık, ayar hâlâ kapalı; migration hiçbir şey silmedi ve claim vermez.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
select pg_temp.assert_true(archive_retention_gate_open(),'0021 kapıyı açar');
select pg_temp.assert_true(not archive_retention_enabled(),'0021 silmeyi kendiliğinden açmaz');
select pg_temp.assert_true(not exists(select 1 from claim_archive_expiry_objects(10)),'Etkinleştirilmeden claim yok');
select pg_temp.assert_true(not exists(select 1 from archive_expiry_objects where state='deleted'),'Migration hiçbir dosyayı silinmiş işaretlemedi');
select pg_temp.assert_true(has_function_privilege('service_role','archive_retention_gate_open()','execute') and not has_function_privilege('authenticated','archive_retention_gate_open()','execute'),'Kapı fonksiyonunun izinleri korunur');
rollback;
