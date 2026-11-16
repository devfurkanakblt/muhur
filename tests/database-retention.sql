-- Plan 5 · 0020: 30 günlük arşiv saklama defteri. 0019 sonrası çalışır; sonunda geri alınır.
-- Silme kapalı başlar; 0021 kapısı testte işlem içinde açılır (gerçek 0021 ayrıca sınanır).
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.expect_error(command text, pattern text, label text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if sqlerrm not like '%' || pattern || '%' then raise exception 'FAIL: %, beklenmeyen hata: %', label, sqlerrm; end if;
    raise notice 'PASS: %', label;
    return;
  end;
  raise exception 'FAIL: %, işlem reddedilmeliydi', label;
end $$;

-- Kişiler: 1 head admin (0018 kurulumundan), 2 sahip, 3 yaratıcı.
insert into auth.users(id) select ('21000000-0000-0000-0000-00000000000'||n)::uuid from generate_series(2,3) n;
insert into communities(id,slug,name,status) values('21000000-0000-0000-0000-000000000101','plan5-saklama','Saklama','onaylandi');
insert into community_members(community_id,user_id,github_login,role) values('21000000-0000-0000-0000-000000000101','21000000-0000-0000-0000-000000000002','sahip','owner');

-- Etkinlikler: A (eski kilit, vadesi geçmiş), B (erken kilit), C (kilitsiz), D (1200 teslimli), G (manifest sonradan değişir).
insert into events(id,community_id,slug,title,starts_at,deadline) select ('21000000-0000-0000-0000-0000000002'||n)::uuid,'21000000-0000-0000-0000-000000000101','saklama-'||n,'Saklama '||n,clock_timestamp()-interval '40 days',clock_timestamp()+interval '1 day'
 from unnest(array['01','02','03','04','05']) n;
-- Projeler kilitten önce (teslim açıkken) yazılır.
create function pg_temp.project(ev uuid, repo bigint) returns uuid language sql as $$
 insert into projects(event_id,exhibit_no,name,team_name,summary,repo_id,repo_full_name,repo_url,default_branch,created_by)
 values(ev,0,'Proje '||repo,'Ekip '||repo,'Saklama testi için örnek proje.',repo,'o/r'||repo,'https://github.com/o/r'||repo,'main','21000000-0000-0000-0000-000000000003') returning id $$;
create temp table pa as select pg_temp.project('21000000-0000-0000-0000-000000000201',1) id;
create temp table pb as select pg_temp.project('21000000-0000-0000-0000-000000000202',2) id;
create temp table pd as select pg_temp.project('21000000-0000-0000-0000-000000000204',4) id;
create temp table pg5 as select pg_temp.project('21000000-0000-0000-0000-000000000205',5) id;
-- A: üç teslim (biri budanmış), kabul = son teslim, ara mühür; sonra mühür aynı yolu kullanır.
insert into submissions(id,project_id,sha,branch,archive_path,archive_sha256,archive_bytes) values
 ('21000000-0000-0000-0000-00000000a001',(select id from pa),repeat('1',40),'main','teslim/21000000-0000-0000-0000-00000000a001.zip',repeat('1',64),100),
 ('21000000-0000-0000-0000-00000000a002',(select id from pa),repeat('2',40),'main','teslim/21000000-0000-0000-0000-00000000a002.zip',repeat('2',64),200),
 ('21000000-0000-0000-0000-00000000a003',(select id from pa),repeat('3',40),'main','teslim/21000000-0000-0000-0000-00000000a003.zip',repeat('3',64),300);
update submissions set archive_pruned_at=clock_timestamp() where id='21000000-0000-0000-0000-00000000a001';
update projects set accepted_sha=repeat('3',40),accepted_at=clock_timestamp(),accepted_branch='main',accepted_archive_path='teslim/21000000-0000-0000-0000-00000000a003.zip',accepted_archive_sha256=repeat('3',64),accepted_archive_bytes=300 where id=(select id from pa);
insert into snapshots(project_id,sha,archive_path,archive_bytes,archive_sha256) values((select id from pa),repeat('4',40),'ara-muhur/saklama-01/001-4444444.zip',400,repeat('4',64));
-- D: 1200 teslim (sayfalama ve beklenen toplam).
insert into submissions(id,project_id,sha,branch,archive_path,archive_sha256,archive_bytes)
 select x.id,(select id from pd),repeat('d',40),'main','teslim/'||x.id||'.zip',repeat('d',64),10 from (select gen_random_uuid() id from generate_series(1,1200)) x;

-- Mühür kilitten önce yazılır (vadesi geçmiş etkinlikte mühür yazılamaz; ayrıca sınanır).
update projects set archive_path=accepted_archive_path,archive_sha256=accepted_archive_sha256,archive_bytes=accepted_archive_bytes,frozen_sha=accepted_sha,frozen_at=clock_timestamp(),frozen_method='accepted' where id=(select id from pa);
-- Kilitler: A ve G 31 gün önce (vadesi geçmiş), B şimdi erken kilit, D 31 gün önce.
update events set locked_at=clock_timestamp()-interval '31 days' where id in ('21000000-0000-0000-0000-000000000201','21000000-0000-0000-0000-000000000204','21000000-0000-0000-0000-000000000205');
select lock_delivery_event('21000000-0000-0000-0000-000000000202','test',true);

-- Vade -------------------------------------------------------------------------------------------
select pg_temp.assert_true((select archive_expires_at = locked_at + interval '720 hours' from events where id='21000000-0000-0000-0000-000000000201'),'Vade kalıcı kilitten tam 720 saat');
select pg_temp.assert_true((select archive_expires_at is null from events where id='21000000-0000-0000-0000-000000000203'),'Kilit yokken vade yok');
select pg_temp.assert_true((select archive_expires_at = locked_at + interval '30 days' and archive_expires_at < deadline + interval '30 days' from events where id='21000000-0000-0000-0000-000000000202'),'Erken kilitte vade son tarihten değil kilit anından');
create temp table b as select archive_expires_at x from events where id='21000000-0000-0000-0000-000000000202';
select pg_temp.assert_true(archive_availability('21000000-0000-0000-0000-000000000202',(select x from b)-interval '1 millisecond')='expiring','30 gün eksi 1 ms: indirilebilir (son 72 saat)');
select pg_temp.assert_true(archive_availability('21000000-0000-0000-0000-000000000202',(select x from b))='expired','Tam eşikte süre dolmuş');
select pg_temp.assert_true(archive_availability('21000000-0000-0000-0000-000000000202',(select x from b)+interval '1 millisecond')='expired','30 gün artı 1 ms: süre dolmuş');
select pg_temp.assert_true(archive_availability('21000000-0000-0000-0000-000000000202',(select x from b)-interval '73 hours')='available','Vadeye 73 saat varken normal');
select pg_temp.assert_true(archive_availability('21000000-0000-0000-0000-000000000203')='available','Kilitsiz etkinlik normal');
select pg_temp.assert_true(archive_availability('21000000-0000-0000-0000-000000000201')='expired' and archive_availability('21000000-0000-0000-0000-000000000202')='available','İki etkinliğin vadesi birbirinden bağımsız');
select pg_temp.expect_error($$update events set locked_at=clock_timestamp() where id='21000000-0000-0000-0000-000000000201'$$,'LOCKED','Kalıcı kilit zamanı değiştirilemez');
update events set archive_expires_at=clock_timestamp()+interval '100 days' where id='21000000-0000-0000-0000-000000000202';
select pg_temp.assert_true((select archive_expires_at=(select x from b) from events where id='21000000-0000-0000-0000-000000000202'),'Vade elle uzatılamaz (kilitten yeniden hesaplanır)');
select pg_temp.assert_true((select (archive_access('21000000-0000-0000-0000-000000000201')->>'state')='expired' and (archive_access('21000000-0000-0000-0000-000000000201')->>'seconds_left')::bigint=0),'Okuyucu penceresi DB saatine göre süre dolmuş der');

-- Manifest ---------------------------------------------------------------------------------------
create temp table ma as select * from archive_expiry_manifest('21000000-0000-0000-0000-000000000201');
select pg_temp.assert_true((select count(*)=4 from ma),'Manifest: üç teslim (budanmış dahil) + ara mühür; kabul/mühür aynı yol tek kez');
select pg_temp.assert_true((select jsonb_array_length(refs)=3 from ma where path='teslim/21000000-0000-0000-0000-00000000a003.zip'),'Aynı yol mühür, kabul ve teslim referanslarını birlikte taşır');
select pg_temp.assert_true(exists(select 1 from ma where path='teslim/21000000-0000-0000-0000-00000000a001.zip' and refs @> '[{"kind":"teslim-budanmis"}]'),'Budanmış eski teslim de manifestte');
select pg_temp.assert_true(exists(select 1 from ma where path like 'ara-muhur/saklama-01/%'),'Ara mühür manifestte');
select pg_temp.assert_true((archive_expiry_preview('21000000-0000-0000-0000-000000000204')->>'objects')::int=1200,'1000 satır üstü manifest eksiksiz');
select pg_temp.assert_true((archive_expiry_preview('21000000-0000-0000-0000-000000000201')->>'manifest_hash')=(archive_expiry_preview('21000000-0000-0000-0000-000000000201')->>'manifest_hash'),'Manifest özeti deterministik');
select pg_temp.expect_error($$select * from archive_expiry_manifest('21000000-0000-0000-0000-000000000203')$$,'Kalıcı kilit','Kilitsiz etkinliğin manifesti hazırlanmaz');
-- Fail-closed: kapsam dışı yol, başka etkinliğe ait slug, başka etkinlikle paylaşılan yol.
select pg_temp.expect_error($x$do $d$ begin
  insert into snapshots(project_id,sha,archive_path,archive_bytes,archive_sha256) values((select id from pa),repeat('5',40),'logolar/x.zip',1,repeat('5',64));
  perform * from archive_expiry_manifest('21000000-0000-0000-0000-000000000201'); end $d$$x$,'Kapsam dışı','Kapsam dışı yol varsa manifest durur');
select pg_temp.expect_error($x$do $d$ begin
  insert into snapshots(project_id,sha,archive_path,archive_bytes,archive_sha256) values((select id from pa),repeat('6',40),'ara-muhur/baska-etkinlik/001-6666666.zip',1,repeat('6',64));
  perform * from archive_expiry_manifest('21000000-0000-0000-0000-000000000201'); end $d$$x$,'Kapsam dışı','Başka etkinliğin ara mühür klasörü kabul edilmez');
select pg_temp.expect_error($x$do $d$ declare pid uuid; begin
  pid := pg_temp.project('21000000-0000-0000-0000-000000000203',77);
  update projects set accepted_archive_path='teslim/21000000-0000-0000-0000-00000000a002.zip' where id=pid;
  perform * from archive_expiry_manifest('21000000-0000-0000-0000-000000000201'); end $d$$x$,'başka bir etkinlikte','Başka etkinlikle paylaşılan yol silinmeye aday olmaz');

-- Hazırlık ve kapalı silme -------------------------------------------------------------------------
create temp table ra as select prepare_archive_expiry('21000000-0000-0000-0000-000000000201') id;
select pg_temp.assert_true(prepare_archive_expiry('21000000-0000-0000-0000-000000000201')=(select id from ra),'Hazırlık tekrar çağrılınca aynı işi döndürür');
select pg_temp.assert_true((select manifest_hash=(archive_expiry_preview('21000000-0000-0000-0000-000000000201')->>'manifest_hash') and object_count=4 and total_bytes=1000 and state='prepared' from archive_expiry_runs where id=(select id from ra)),'Defter manifest özeti önizlemeyle aynı');
select pg_temp.assert_true(exists(select 1 from admin_audit where action='archive_expiry_prepared' and event_id='21000000-0000-0000-0000-000000000201'),'Hazırlık denetim kaydına yazılır');
select pg_temp.assert_true(not archive_retention_enabled() and not exists(select 1 from claim_archive_expiry_objects(10)),'Silme kapalıyken hiçbir nesne claim edilmez');
select pg_temp.expect_error($$select set_archive_retention('18000000-0000-0000-0000-000000000001','head',true,'Deneme açılışı')$$,'0021','Kapı (0021) kapalıyken silme açılamaz');
select pg_temp.expect_error($$select set_archive_retention('21000000-0000-0000-0000-000000000002','sahip',true,'Deneme')$$,'YETKI','Topluluk sahibi saklama ayarını değiştiremez');
select pg_temp.expect_error($$update archive_expiry_runs set manifest_hash=repeat('0',64)$$,'değiştirilemez','Manifest kanıtı değiştirilemez');
select pg_temp.expect_error($$update archive_expiry_objects set path='teslim/00000000-0000-0000-0000-000000000000.zip'$$,'değiştirilemez','Manifest yolu değiştirilemez');
select pg_temp.expect_error($$delete from archive_expiry_objects$$,'silinemez','Defter satırı silinemez');
select pg_temp.expect_error($$update archive_expiry_runs set state='completed'$$,'Geçersiz','İş durumu atlanamaz');

-- Kapıyı işlem içinde aç (0021'in etkisi), okuyucu onayı ve etkinleştirme ------------------------------
create or replace function archive_retention_gate_open() returns boolean language sql stable set search_path=public as $$ select true $$;
select pg_temp.expect_error($$select set_archive_retention('18000000-0000-0000-0000-000000000001','head',true,'Deneme açılışı')$$,'okuyucu','Okuyucu/kuru koşum onayı olmadan açılamaz');
select confirm_archive_readers('18000000-0000-0000-0000-000000000001','head','{"events":1,"objects":4}','Okuyucular yeni sürümde');
select set_archive_retention('18000000-0000-0000-0000-000000000001','head',true,'Test aktivasyonu');
select pg_temp.assert_true(archive_retention_enabled(),'Head admin gerekçeyle etkinleştirir');

-- Hazırlıktan sonra manifest değişirse silme durur (blocked).
create temp table rg as select prepare_archive_expiry('21000000-0000-0000-0000-000000000205') id;
insert into submissions(id,project_id,sha,branch,archive_path,archive_sha256,archive_bytes) values('21000000-0000-0000-0000-00000000a005',(select id from pg5),repeat('7',40),'main','teslim/21000000-0000-0000-0000-00000000a005.zip',repeat('7',64),7);

-- Claim / complete / fail -------------------------------------------------------------------------
create temp table c1 as select * from claim_archive_expiry_objects(2);
select pg_temp.assert_true((select state='blocked' from archive_expiry_runs where id=(select id from rg)),'Manifest değişen iş silinmeden durdurulur');
select pg_temp.assert_true(not exists(select 1 from c1 where event_id='21000000-0000-0000-0000-000000000205'),'Durdurulan işten nesne claim edilmez');
select pg_temp.assert_true((select count(*)=2 and bool_and(state='processing' and lease_token is not null and attempts=1) from c1),'Küçük batch claim edilir ve kiralanır');
select pg_temp.assert_true((select state='deleting' from archive_expiry_runs where id=(select id from ra)),'İş silme durumuna geçer');
create temp table c1b as select * from claim_archive_expiry_objects(10);
select pg_temp.assert_true(not exists(select 1 from c1b x where x.id in (select id from c1)) and (select count(*)=2 from c1b),'Kiralanmış nesne ikinci işçiye verilmez; ikinci işçi kalanları alır');
select pg_temp.assert_true(not complete_archive_expiry_object((select id from c1 limit 1),gen_random_uuid()),'Yanlış tokenla tamamlanmaz');
create temp table first as select id, lease_token from c1 order by path limit 1;
select pg_temp.assert_true(complete_archive_expiry_object((select id from first),(select lease_token from first)),'Doğru tokenla tamamlanır');
select pg_temp.assert_true((select state='deleted' and deleted_at is not null from archive_expiry_objects where id=(select id from first)),'Silinme zamanı defterde');
select pg_temp.assert_true(not complete_archive_expiry_object((select id from first),(select lease_token from first)),'Aynı token ikinci kez tamamlayamaz');
select pg_temp.assert_true(exists(select 1 from admin_audit where action='archive_object_expired' and after->>'path'=(select path from archive_expiry_objects where id=(select id from first))),'Silme denetim kaydında (içerik değil yol/hash)');
-- Kira süresi dolan nesne geri alınır; eski token yeni kirayı tamamlayamaz.
create temp table second as select id, lease_token from c1 order by path offset 1 limit 1;
update archive_expiry_objects set lease_until=clock_timestamp()-interval '1 second' where id=(select id from second);
create temp table c2 as select * from claim_archive_expiry_objects(10);
select pg_temp.assert_true(exists(select 1 from c2 where id=(select id from second) and attempts=2) and (select count(*)=1 from c2),'Süresi dolan kira yeniden claim edilir; geçerli kiralar alınmaz');
select pg_temp.assert_true(not complete_archive_expiry_object((select id from second),(select lease_token from second)),'Kirayı kaybeden işçi tamamlayamaz');
-- Hata: sınırlı yeniden deneme, sonra terminal.
select pg_temp.assert_true(fail_archive_expiry_object((select id from c2 where id=(select id from second)),(select lease_token from c2 where id=(select id from second)),'Storage 503'),'Geçici hata kaydedilir');
select pg_temp.assert_true((select state='pending' and next_attempt_at>clock_timestamp() and last_error='Storage 503' from archive_expiry_objects where id=(select id from second)),'Geçici hata geri çekilmeyle bekler');
select pg_temp.assert_true(finalize_archive_expiry((select id from ra))='deleting','Açık nesne varken iş bitmiş sayılmaz');
-- Kalan nesneleri tamamla (vadeyi öne çekerek), biri terminal hataya düşsün.
update archive_expiry_objects set next_attempt_at=clock_timestamp()-interval '1 second' where run_id=(select id from ra) and state='pending';
create temp table c3 as select * from claim_archive_expiry_objects(10);
select complete_archive_expiry_object(id,lease_token) from c1b;
update archive_expiry_objects set attempts=5 where id=(select id from second);
select pg_temp.assert_true(fail_archive_expiry_object((select id from second),(select lease_token from c3 where id=(select id from second)),'Erişim reddedildi'),'Beşinci hata terminal');
select pg_temp.assert_true((select state='failed' from archive_expiry_objects where id=(select id from second)),'Terminal hatada nesne failed');
select pg_temp.assert_true(finalize_archive_expiry((select id from ra))='failed','Terminal hata varsa iş tamamlandı sayılmaz');
select pg_temp.assert_true((archive_retention_report()->>'failed')::int>=1 and (archive_retention_report()->>'deleted')::int>=3,'Platform raporu silinen ve başarısız sayıları gösterir');

-- Kanıt kayıtları değişmedi.
select pg_temp.assert_true((select archive_path='teslim/21000000-0000-0000-0000-00000000a003.zip' and archive_sha256=repeat('3',64) and frozen_sha=repeat('3',40) and accepted_archive_path is not null from projects where id=(select id from pa)),'Mühür ve kabul kanıtı korunur');
select pg_temp.assert_true((select count(*)=3 and bool_and(archive_sha256 is not null) from submissions where project_id=(select id from pa)),'Teslim geçmişi kayıtları korunur');
select pg_temp.assert_true((select count(*)=1 from snapshots where project_id=(select id from pa)),'Ara mühür kaydı korunur');
select pg_temp.assert_true((select archive_pruned_at is null from submissions where id='21000000-0000-0000-0000-00000000a003'),'Saklama silmesi archive_pruned_at alanını kullanmaz');

-- Süre dolduktan sonra yeniden mühürleme yok.
create temp table pa2 as select pg_temp.project('21000000-0000-0000-0000-000000000203',9) id;
update events set locked_at=clock_timestamp()-interval '31 days' where id='21000000-0000-0000-0000-000000000203';
select pg_temp.assert_true(enqueue_seals('21000000-0000-0000-0000-000000000203')=0 and not exists(select 1 from delivery_jobs where event_id='21000000-0000-0000-0000-000000000203' and kind='seal'),'Süresi dolmuş etkinlikte yeni mühür işi açılmaz');
select pg_temp.expect_error($$update projects set archive_path='teslim/x.zip',archive_sha256=repeat('9',64),archive_bytes=1 where id=(select id from pa2)$$,'SAKLAMA','Süre dolduktan sonra mühür alanı yazılamaz');

-- Kapatma serbest; erişim.
select set_archive_retention('18000000-0000-0000-0000-000000000001','head',false,'Kontrollü kapatma');
select pg_temp.assert_true(not archive_retention_enabled() and not exists(select 1 from claim_archive_expiry_objects(10)),'Kapatılınca yeni claim yok');
select pg_temp.assert_true(not has_table_privilege('authenticated','archive_expiry_objects','select') and not has_table_privilege('anon','archive_expiry_runs','select') and not has_table_privilege('service_role','archive_expiry_objects','update'),'Defter istemcilere kapalı; servis rolü doğrudan yazamaz');
select pg_temp.assert_true(not has_function_privilege('authenticated','claim_archive_expiry_objects(integer)','execute'),'Silme RPC''leri istemcilere kapalı');
rollback;
