-- Üretim bağlantısı kullanmaz; scripts/test-db.mjs'nin oluşturduğu ayrı veritabanında çalışır.
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

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'), ('00000000-0000-0000-0000-000000000004');
update public.events set is_current = false where is_current;
insert into public.events(id, slug, title, starts_at, deadline, is_current)
values ('10000000-0000-0000-0000-000000000001', 'test-event', 'Teslim Testi', clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour', true);

create temp table fixture as select id from public.register_project(
  '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  'owner', null, 'Proje Bir', 'Ekip Bir', 'Bu bir test projesidir.', 123, 'owner/repo', 'https://github.com/owner/repo', 'main', null, repeat('a', 40)
);
select pg_temp.assert_true((select count(*) = 1 from project_members where project_id = (select id from fixture) and role = 'owner'), 'Kayıt ve kurucu üyeliği atomik');
select pg_temp.assert_true((select count(*) = 1 from delivery_jobs where project_id = (select id from fixture)), 'İlk arşiv işi kayıtla birlikte yaratıldı');

select pg_temp.expect_error($cmd$ select public.register_project(
  '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner', null,
  'İkinci Proje', 'Ekip Bir', 'Bu bir test projesidir.', 124, 'owner/repo2', 'https://github.com/owner/repo2', 'main') $cmd$, 'MEMBER', 'Aynı kullanıcı ikinci proje açamaz');
select pg_temp.assert_true((select count(*) = 1 from projects where event_id = '10000000-0000-0000-0000-000000000001'), 'Başarısız kayıt yetim proje bırakmadı');

create temp table claimed as select * from public.claim_delivery_jobs((select id from fixture), 1);
select pg_temp.assert_true((select count(*) = 1 from claimed), 'İş tek çalışan tarafından sahiplenildi');
select pg_temp.assert_true((select count(*) = 0 from public.claim_delivery_jobs((select id from fixture), 1)), 'İkinci çalışan aktif işi alamaz');
select pg_temp.assert_true(not public.complete_submission((select id from claimed), gen_random_uuid(), 'teslim/' || (select id::text from claimed) || '.zip', repeat('b',64), 128), 'Yanlış işlem tokeni teslimi tamamlayamaz');
select pg_temp.assert_true(public.complete_submission((select id from claimed), (select lease_token from claimed), 'teslim/' || (select id::text from claimed) || '.zip', repeat('b',64), 128), 'Süre dolmadan doğrulanmış teslim kabul edildi');
select pg_temp.assert_true((select accepted_sha = repeat('a',40) from projects where id = (select id from fixture)), 'Kabul edilmiş commit sabitlendi');
select pg_temp.assert_true(not public.complete_submission((select id from claimed), (select lease_token from claimed), 'teslim/' || (select id::text from claimed) || '.zip', repeat('c',64), 128), 'Tamamlanmış iş ikinci kez değiştirilemez');

insert into project_members(project_id, event_id, user_id, github_login, role)
select id, '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'member', 'member' from fixture;
select public.transfer_project_owner((select id from fixture), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
select pg_temp.assert_true((select count(*) = 1 from project_members where project_id = (select id from fixture) and role = 'owner'), 'Kurucu devrinden sonra tek kurucu kaldı');
select pg_temp.assert_true((select role = 'member' from project_members where project_id = (select id from fixture) and user_id = '00000000-0000-0000-0000-000000000001'), 'Eski kurucu ekip üyesi olarak kaldı');

select public.enqueue_submission((select id from fixture), '00000000-0000-0000-0000-000000000002', repeat('c',40), 'main', 'owner/repo');
create temp table retry_job as select * from public.claim_delivery_jobs((select id from fixture), 1);
select public.fail_delivery_job((select id from retry_job), (select lease_token from retry_job), 'Geçici depo hatası', true);
select pg_temp.assert_true((select state = 'queued' and next_attempt_at > clock_timestamp() from delivery_jobs where id = (select id from retry_job)), 'Geçici hata gecikmeli yeniden denemeye alındı');
select pg_temp.assert_true((select accepted_sha = repeat('a',40) from projects where id = (select id from fixture)), 'Başarısız güncelleme önceki teslimi korudu');

update delivery_jobs set next_attempt_at = clock_timestamp() - interval '1 minute' where id = (select id from retry_job);
create temp table second_claim as select * from public.claim_delivery_jobs((select id from fixture), 1);
select pg_temp.assert_true((select attempts = 2 and lease_token <> (select lease_token from retry_job) from second_claim), 'Yeniden denemeye yeni işlem tokeni verildi');
select pg_temp.assert_true(not public.complete_submission((select id from retry_job), (select lease_token from retry_job), 'teslim/' || (select id::text from retry_job) || '.zip', repeat('d',64), 128), 'Eski çalışan yeniden denemeyi tamamlayamaz');

-- Erken kilit: halen devam eden yeni güncelleme kabul edilmez.
update events set locked_at = clock_timestamp(), locked_by = 'test' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.assert_true(not public.complete_submission((select id from second_claim), (select lease_token from second_claim), 'teslim/' || (select id::text from second_claim) || '.zip', repeat('d',64), 128), 'Erken kilitten sonra devam eden teslim reddedildi');
select pg_temp.assert_true((select accepted_sha = repeat('a',40) from projects where id = (select id from fixture)), 'Kilit sonrası eski kabul edilmiş sürüm korunuyor');
select pg_temp.expect_error(format('update projects set demo_url = %L where id = %L', 'https://demo.example.com', (select id from fixture)), 'LOCKED', 'Kilit sonrası demo değiştirilemez');
select pg_temp.expect_error(format('update projects set accepted_sha = repeat(''e'',40) where id = %L', (select id from fixture)), 'LOCKED', 'Kilit sonrası teslim SHA değiştirilemez');
select pg_temp.expect_error(format('delete from projects where id = %L', (select id from fixture)), 'LOCKED', 'Kilitli proje silinemez');
select pg_temp.expect_error('update events set locked_at = null where id = ''10000000-0000-0000-0000-000000000001''', 'LOCKED', 'Kilit geri alınamaz');

select public.enqueue_seals('10000000-0000-0000-0000-000000000001');
create temp table seal_job as select * from public.claim_delivery_jobs((select id from fixture), 1);
select pg_temp.assert_true(public.complete_seal((select id from seal_job), (select lease_token from seal_job)), 'Mühür yalnızca kabul edilmiş sürümden tamamlandı');
select pg_temp.assert_true((select frozen_sha = accepted_sha and archive_sha256 = accepted_archive_sha256 and archive_path = accepted_archive_path from projects where id = (select id from fixture)), 'Mühür SHA, arşiv yolu ve hash aynı teslimi gösteriyor');
select pg_temp.expect_error(format('update projects set frozen_sha = repeat(''f'',40) where id = %L', (select id from fixture)), 'LOCKED', 'Mühür SHA değiştirilemez');
select pg_temp.expect_error(format('update projects set archive_sha256 = repeat(''e'',64) where id = %L', (select id from fixture)), 'LOCKED', 'Mühür arşiv özeti değiştirilemez');

insert into awards(event_id, project_id, title, reason) select '10000000-0000-0000-0000-000000000001', id, 'En iyi çözüm', 'Jüri tarafından seçilen çözüm.' from fixture;
select pg_temp.assert_true((select count(*) = 1 from awards), 'Mühürlü projeye jüri ödülü verildi');
select pg_temp.expect_error(format('insert into awards(event_id, project_id, title, reason) values(%L,%L,''Başka ödül'',''Geçerli bir gerekçe.'')', (select id from events where slug='2026-guz'), (select id from fixture)), 'bu etkinliğin', 'Başka etkinliğin projesine ödül verilemez');

-- Oylama: tek oy ve kendi ekibine oy vermeme.
update events set voting = 'acik' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect_error(format('insert into votes(event_id,user_id,project_id,github_login) values(%L,%L,%L,''member'')', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', (select id from fixture)), 'Kendi ekibine', 'Kendi ekibine oy verilemez');
insert into votes(event_id,user_id,project_id,github_login) select '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', id, 'visitor' from fixture;
update events set voting = 'sonuclandi' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect_error('delete from votes where event_id = ''10000000-0000-0000-0000-000000000001''', 'Oylama açık değil', 'Sonuçlandıktan sonra oy silinemez');

-- Başarısız etkinlik geçişinde güncel etkinlik korunur.
select pg_temp.expect_error($cmd$ select public.switch_event('10000000-0000-0000-0000-000000000001','Yeni etkinlik','test-event',clock_timestamp(),clock_timestamp()+interval '2 hours') $cmd$, 'events_slug_key', 'Aynı slug ile yeni etkinlik reddedilir');
select pg_temp.assert_true((select is_current from events where id='10000000-0000-0000-0000-000000000001'), 'Başarısız geçiş güncel etkinliği bozmadı');
select public.switch_event('10000000-0000-0000-0000-000000000001','Yeni etkinlik','test-next',clock_timestamp(),clock_timestamp()+interval '2 hours');
select pg_temp.assert_true((select count(*) = 1 from events where is_current), 'Başarılı geçişten sonra tam bir güncel etkinlik var');

-- Süre transaction başladıktan sonra dolarsa now() değil clock_timestamp() uygulanır.
create temp table deadline_project as select id from public.register_project(
  (select id from events where is_current), '00000000-0000-0000-0000-000000000004',
  'late', null, 'Son Proje', 'Son Ekip', 'Bu bir son saniye testidir.', 999, 'late/repo', 'https://github.com/late/repo', 'main', null, repeat('f',40)
);
create temp table deadline_job as select * from public.claim_delivery_jobs((select id from deadline_project),1);
update events set deadline=clock_timestamp()+interval '0.2 seconds', starts_at=clock_timestamp()-interval '1 hour' where is_current;
select pg_sleep(0.3);
select pg_temp.assert_true(not public.complete_submission((select id from deadline_job), (select lease_token from deadline_job), 'teslim/' || (select id::text from deadline_job) || '.zip', repeat('a',64),128), 'Gerçek son tarih geçtikten sonra teslim kabul edilmedi');
select pg_temp.expect_error('update events set deadline=clock_timestamp()+interval ''1 hour'' where is_current', 'LOCKED', 'Süre dolunca aynı transaction içinde zaman uzatılamaz');

select public.enqueue_seals((select id from events where is_current));
create temp table missing_seal as select * from public.claim_delivery_jobs((select id from deadline_project),1);
select pg_temp.expect_error(format('select public.complete_seal(%L,%L)', (select id from missing_seal), (select lease_token from missing_seal)), 'kabul edilmiş teslim sürümü yok', 'Kod teslimi olmayan proje güncel HEAD ile mühürlenemez');
select public.fail_delivery_job((select id from missing_seal), (select lease_token from missing_seal), 'Kabul edilmiş teslim yok.', false);
select pg_temp.assert_true((select state = 'failed' from delivery_jobs where id = (select id from missing_seal)), 'Kalıcı mühür hatası sonsuza kadar tekrar denenmez');
select pg_temp.expect_error(format('select public.retry_delivery_job(%L)', (select id from deadline_job)), 'LOCKED', 'Geç teslim işi admin tarafından da kabul ettirilemez');
select pg_temp.expect_error(format('update submissions set archive_sha256 = repeat(''f'',64) where project_id = %L', (select id from fixture)), 'LOCKED', 'Kabul geçmişi değiştirilemez');

select public.switch_event((select id from events where is_current),'Worker testi','test-worker',clock_timestamp(),clock_timestamp()+interval '1 hour');
create temp table expired_project as select id from public.register_project(
  (select id from events where is_current), '00000000-0000-0000-0000-000000000003', 'worker', null,
  'Worker Proje', 'Worker Ekip', 'Bu bir worker zaman aşımı testidir.', 1001, 'worker/repo', 'https://github.com/worker/repo', 'main', null, repeat('a',40)
);
create temp table expired_job as select * from public.claim_delivery_jobs((select id from expired_project),1);
update delivery_jobs set attempts = 5, lease_until = clock_timestamp() - interval '1 minute' where id = (select id from expired_job);
select * from public.claim_delivery_jobs((select id from expired_project),1);
select pg_temp.assert_true((select state = 'failed' from delivery_jobs where id = (select id from expired_job)), 'Beşinci denemede ölen çalışan işini processing durumunda bırakmaz');
select pg_temp.assert_true((select delivery_error is not null from projects where id = (select id from expired_project)), 'Worker zaman aşımı ekip paneline hata olarak yansır');
select pg_temp.assert_true(public.retry_delivery_job((select id from expired_job)), 'Teslim açıkken admin yeniden deneme başlatabilir');
create temp table resumed_job as select * from public.claim_delivery_jobs((select id from expired_project),1);
select pg_temp.assert_true(public.complete_submission((select id from resumed_job), (select lease_token from resumed_job), 'teslim/' || (select id::text from resumed_job) || '.zip', repeat('c',64),128), 'Yeniden denenen aynı sürüm kabul edildi');
select public.lock_delivery_event((select id from events where is_current),'test-admin',true);
select pg_temp.assert_true((select e.locked_at > p.accepted_at from events e join projects p on p.event_id=e.id where p.id=(select id from expired_project)), 'Erken kilit zamanı DB kabulünden sonra hesaplandı');

select pg_temp.assert_true(not has_function_privilege('anon','public.claim_delivery_jobs(uuid,integer)','EXECUTE'), 'Anon iş kuyruğunu çalıştıramaz');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.complete_submission(uuid,uuid,text,text,bigint)','EXECUTE'), 'Kullanıcı arşivi doğrudan kabul ettiremez');
select pg_temp.assert_true(has_function_privilege('service_role','public.complete_submission(uuid,uuid,text,text,bigint)','EXECUTE'), 'Sunucu rolü teslim kabul RPC çalıştırabilir');
rollback;
