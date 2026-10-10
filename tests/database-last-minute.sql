-- 0006 son dakika teslimleri. scripts/test-db.mjs'nin ayrı veritabanında çalışır, sonunda geri alınır.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

insert into auth.users(id) values ('50000000-0000-0000-0000-000000000001'), ('50000000-0000-0000-0000-000000000002');
update public.events set is_current = false where is_current;
insert into public.events(id, slug, title, starts_at, deadline, is_current)
values ('60000000-0000-0000-0000-000000000001', 'son-dakika', 'Son Dakika', clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour', true);

create temp table sd as select id from public.register_project(
  '60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
  'kurucu', null, 'Son Dakika', 'Son Ekip', 'Son dakika teslim testi.', 601, 'kurucu/son', 'https://github.com/kurucu/son', 'main', null, repeat('a', 40)
);

-- Geri çekilme: son tarih uzaktayken eski davranış, son 15 dakikada en fazla 10 sn.
create temp table j1 as select * from public.claim_delivery_jobs((select id from sd), 1);
select public.fail_delivery_job((select id from j1), (select lease_token from j1), 'Arşiv indirilemedi (502)', true);
select pg_temp.assert_true((select state = 'queued' and next_attempt_at > clock_timestamp() + interval '50 seconds' from delivery_jobs where id = (select id from j1)),
  'Son tarih uzaktayken geçici hata eski geri çekilmeyi kullanır');
update events set deadline = clock_timestamp() + interval '5 minutes' where id = '60000000-0000-0000-0000-000000000001';
create temp table j1b as select * from public.claim_delivery_jobs((select id from sd), 1);
select pg_temp.assert_true((select count(*) = 0 from j1b), 'Geri çekilmedeki iş zamanı gelmeden alınmaz');
update delivery_jobs set next_attempt_at = clock_timestamp() where id = (select id from j1);
create temp table j1c as select * from public.claim_delivery_jobs((select id from sd), 1);
select public.fail_delivery_job((select id from j1c), (select lease_token from j1c), 'Storage 503', true);
select pg_temp.assert_true((select state = 'queued' and next_attempt_at <= clock_timestamp() + interval '10 seconds' from delivery_jobs where id = (select id from j1)),
  'Son 15 dakikada geçici hatanın geri çekilmesi en fazla 10 sn');

-- Aynı sürüm yeniden istenirse bekleme atlanır.
create temp table r1 as select public.enqueue_submission((select id from sd), '50000000-0000-0000-0000-000000000001', repeat('a', 40), 'main', 'kurucu/son') as r;
select pg_temp.assert_true((select r->>'status' = 'queued' and (r->>'jobId')::uuid = (select id from j1) from r1), 'Aynı sürüm aynı işte kalır');
select pg_temp.assert_true((select next_attempt_at <= clock_timestamp() from delivery_jobs where id = (select id from j1)), 'Yeniden istek bekleme süresini atlar');

-- Bekleyen eski sürüm, daha yeni sürüme yerini bırakır; yeni sürüm yeni iş (yeni arşiv yolu) olarak açılır.
create temp table r2 as select public.enqueue_submission((select id from sd), '50000000-0000-0000-0000-000000000001', repeat('b', 40), 'main', 'kurucu/son') as r;
select pg_temp.assert_true((select r->>'status' = 'queued' and r->>'supersededSha' = repeat('a', 40) and (r->>'jobId')::uuid <> (select id from j1) from r2),
  'Bekleyen sürümün yerine yeni sürüm yeni işle sıraya girer');
select pg_temp.assert_true((select state = 'failed' and error like 'Yerini%' from delivery_jobs where id = (select id from j1)), 'Eski iş kapatıldı');
select pg_temp.assert_true((select count(*) = 1 from delivery_jobs where project_id = (select id from sd) and state in ('queued', 'processing')), 'Projede tek aktif teslim işi var');
select pg_temp.assert_true(exists(select 1 from project_timeline where project_id = (select id from sd) and kind = 'submission_superseded' and detail = repeat('a', 40)), 'Yer değişimi zaman çizelgesinde');

-- İşlenmekte olan iş korunur.
create temp table j2 as select * from public.claim_delivery_jobs((select id from sd), 1);
create temp table r3 as select public.enqueue_submission((select id from sd), '50000000-0000-0000-0000-000000000001', repeat('c', 40), 'main', 'kurucu/son') as r;
select pg_temp.assert_true((select r->>'status' = 'busy' and r->>'queuedSha' = repeat('b', 40) from r3), 'İşlenen iş varken yeni sürüm beklemede kalır');
select pg_temp.assert_true((select state = 'processing' from delivery_jobs where id = (select id from j2)), 'İşlenen iş bozulmadı');

-- Kirası dolmuş iş, yeni sürüme yerini bırakır; eski çalışan sonradan kabul yazamaz.
update delivery_jobs set lease_until = clock_timestamp() - interval '1 second' where id = (select id from j2);
create temp table r4 as select public.enqueue_submission((select id from sd), '50000000-0000-0000-0000-000000000001', repeat('c', 40), 'main', 'kurucu/son') as r;
select pg_temp.assert_true((select r->>'status' = 'queued' and r->>'supersededSha' = repeat('b', 40) from r4), 'Kirası dolan işin yerine yeni sürüm geçer');
select pg_temp.assert_true(not public.complete_submission((select id from j2), (select lease_token from j2), 'teslim/' || (select id from j2) || '.zip', repeat('b', 64), 10),
  'Yeri alınmış işin eski çalışanı kabul yazamaz');

-- Kota dolduysa bekleyen iş olduğu gibi kalır.
insert into delivery_jobs(project_id, event_id, kind, state, sha, branch, repo_full_name)
  select (select id from sd), '60000000-0000-0000-0000-000000000001', 'submit', 'completed', repeat('e', 40), 'main', 'kurucu/son' from generate_series(1, 3);
create temp table r5 as select public.enqueue_submission((select id from sd), '50000000-0000-0000-0000-000000000001', repeat('d', 40), 'main', 'kurucu/son') as r;
select pg_temp.assert_true((select r->>'status' = 'rate_limited' and r->>'queuedSha' = repeat('c', 40) from r5), 'Kota dolunca yeni sürüm reddedilir');
select pg_temp.assert_true((select count(*) = 1 from delivery_jobs where project_id = (select id from sd) and state = 'queued' and sha = repeat('c', 40)), 'Kota dolunca bekleyen iş korunur');

-- Mühür işi en fazla 60 sn bekler.
create temp table sealed as select id from public.register_project(
  '60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
  'ikinci', null, 'Mühür Proje', 'Mühür Ekip', 'Mühür geri çekilme testi.', 602, 'ikinci/son', 'https://github.com/ikinci/son', 'main', null, repeat('f', 40)
);
select public.complete_submission(id, lease_token, 'teslim/' || id || '.zip', repeat('f', 64), 10) from public.claim_delivery_jobs((select id from sealed), 1);
select public.lock_delivery_event('60000000-0000-0000-0000-000000000001', 'test', true);
select public.enqueue_seals('60000000-0000-0000-0000-000000000001');
create temp table s1 as select * from public.claim_delivery_jobs((select id from sealed), 1);
update delivery_jobs set attempts = 4 where id = (select id from s1);
select public.fail_delivery_job((select id from s1), (select lease_token from s1), 'Arşiv deposuna ulaşılamadı.', true);
select pg_temp.assert_true((select state = 'queued' and next_attempt_at <= clock_timestamp() + interval '60 seconds' from delivery_jobs where id = (select id from s1)),
  'Mühür işinin geri çekilmesi en fazla 60 sn');

select pg_temp.assert_true(public.delivery_schema_version() = 6, 'Şema sürümü 6');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.delivery_schema_version()', 'EXECUTE'), 'Kullanıcı şema sürümü RPC''sini çağıramaz');
rollback;
