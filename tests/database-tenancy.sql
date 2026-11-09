-- 0012 çoklu topluluk: şema, roller ve yetki yardımcıları. scripts/test-db.mjs'nin ayrı veritabanında çalışır, sonunda geri alınır.
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

-- Ortak kurulum (sonraki bölümlerde de kullanılır) ---------------------------------------------
-- Kullanıcılar: 50..01 head admin adayı, 50..02 DEÜ organizatörü, 50..03 B topluluğu sahibi, 50..04 B jürisi, 50..05 katılımcı.
-- Etkinlikler: 60..01 DEÜ, 60..02 B.
insert into auth.users(id) values
  ('50000000-0000-0000-0000-000000000001'), ('50000000-0000-0000-0000-000000000002'),
  ('50000000-0000-0000-0000-000000000003'), ('50000000-0000-0000-0000-000000000004'),
  ('50000000-0000-0000-0000-000000000005');
update public.events set is_current = false where is_current;
insert into public.communities(id, slug, name, status)
values ('70000000-0000-0000-0000-000000000002', 'b-topluluk', 'B Topluluğu', 'onaylandi');
insert into public.community_members(community_id, user_id, github_login, role) values
  ((select id from communities where slug = 'deu-csai'), '50000000-0000-0000-0000-000000000002', 'deu-org', 'organizator'),
  ('70000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', 'b-sahip', 'owner');
insert into public.events(id, slug, title, starts_at, deadline, is_current, community_id) values
  ('60000000-0000-0000-0000-000000000001', 'deu-etkinlik', 'DEÜ Etkinliği', clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour', false, (select id from communities where slug = 'deu-csai')),
  ('60000000-0000-0000-0000-000000000002', 'b-etkinlik', 'B Etkinliği', clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour', false, '70000000-0000-0000-0000-000000000002');
insert into public.event_jurors(event_id, user_id, login, provider)
values ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000004', 'b-juri', 'github');

-- Bölüm 1 · şema ve roller ---------------------------------------------------------------------
select pg_temp.assert_true((select count(*) = 0 from events where community_id is null), 'Tüm mevcut etkinlikler bir topluluğa bağlı');
select pg_temp.assert_true((select status = 'onaylandi' and telegram_enabled from communities where slug = 'deu-csai'), 'DEÜ CS&AI onaylı ve Telegram açık');
select pg_temp.assert_true(public.bootstrap_head_admin('50000000-0000-0000-0000-000000000001', 'bas'), 'İlk bootstrap head admin atar');
select pg_temp.assert_true(not public.bootstrap_head_admin('50000000-0000-0000-0000-000000000005', 'saldirgan'), 'İkinci bootstrap etkisiz');
select pg_temp.assert_true(public.is_head_admin('50000000-0000-0000-0000-000000000001') and not public.is_head_admin('50000000-0000-0000-0000-000000000005'), 'Head admin yalnızca bootstrap edilen');
select pg_temp.assert_true((select count(*) = 1 from admin_audit where action = 'bootstrap_head_admin'), 'Bootstrap denetim kaydı yazar');
select pg_temp.assert_true(public.event_role('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001') = 'owner', 'Bootstrap edilen DEÜ sahibi olur');
select pg_temp.assert_true(public.event_role('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002') = 'organizator', 'DEÜ organizatörü kendi etkinliğinde organizatör');
select pg_temp.assert_true(public.event_role('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002') is null, 'DEÜ organizatörünün B etkinliğinde rolü yok');
select pg_temp.assert_true(public.event_role('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000004') = 'juri', 'Jüri yalnızca davetli olduğu etkinlikte');
select pg_temp.assert_true(public.event_role('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004') is null, 'Jürinin başka etkinlikte rolü yok');
select pg_temp.assert_true(public.event_role('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000005') is null, 'Katılımcının rolü yok');
select pg_temp.expect_error($c$ insert into community_members(community_id,user_id,github_login,role) select id,'50000000-0000-0000-0000-000000000005','x','owner' from communities where slug='deu-csai' $c$, 'community_one_owner', 'Toplulukta ikinci sahip olamaz');

-- Bölüm 2 · katılımcı tarafı: yarışma yasağı ve askı ------------------------------------------
-- register_project yalnızca güncel etkinlikte çalışır; önce DEÜ, sonra B etkinliği güncel yapılır.
update public.events set is_current = true where id = '60000000-0000-0000-0000-000000000001';
select pg_temp.expect_error($c$ select public.register_project('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','org',null,'Org Proje','Org Ekip','Organizatör kayıt denemesi.',901,'o/r','https://github.com/o/r','main',null,null) $c$, 'YARISAMAZ', 'Organizatör kendi topluluğunun etkinliğine kayıt olamaz');
update public.events set is_current = false where id = '60000000-0000-0000-0000-000000000001';
update public.events set is_current = true where id = '60000000-0000-0000-0000-000000000002';
select pg_temp.expect_error($c$ select public.register_project('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003','b-sahip',null,'Sahip Proje','Sahip Ekip','Topluluk sahibi kayıt denemesi.',902,'s/r','https://github.com/s/r','main',null,null) $c$, 'YARISAMAZ', 'Topluluk sahibi kendi etkinliğine kayıt olamaz');
select pg_temp.assert_true((select (public.register_project('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','deu-org',null,'Misafir Proje','Misafir Ekip','Başka topluluğun etkinliğinde yarışma.',903,'d/r','https://github.com/d/r','main',null,null)).id is not null), 'Organizatör başka topluluğun etkinliğinde yarışabilir');
select pg_temp.expect_error(format('select public.join_project_by_code(%L, %L, ''b-juri'', null)',
  (select invite_code from projects where repo_id = 903), '50000000-0000-0000-0000-000000000004'), 'YARISAMAZ', 'Jüri kendi etkinliğinde ekibe katılamaz');
-- Oylama koşulları (kilit, mühür) bu bölümün konusu değil; yalnızca kiracılık tetikleyicisi sınanır.
alter table public.votes disable trigger votes_guard;
select pg_temp.expect_error(format('insert into votes(event_id,user_id,project_id,github_login) values(%L,%L,%L,''b-juri'')',
  '60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000004', (select id from projects where repo_id = 903)), 'YARISAMAZ', 'Jüri kendi etkinliğinde oy veremez');
alter table public.votes enable trigger votes_guard;

-- Askı: kuyruktaki iş işlenir, yeni giriş reddedilir.
select public.register_project('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000005','katilimci',null,'Katılımcı Proje','Katılımcı Ekip','Askı öncesi teslim edilen proje.',904,'k/r','https://github.com/k/r','main',null,repeat('c',40));
update public.events set suspended_at = clock_timestamp(), suspended_reason = 'test' where id = '60000000-0000-0000-0000-000000000002';
select pg_temp.expect_error(format('select public.enqueue_submission(%L, %L, %L, ''main'', ''k/r'')',
  (select id from projects where repo_id = 904), '50000000-0000-0000-0000-000000000005', repeat('d',40)), 'ASKIDA', 'Askıda yeni teslim kuyruğa giremez');
select pg_temp.expect_error(format('select public.update_project(%L, %L, ''Yeni Ad'', ''Yeni Ekip'', ''Askıda düzenleme denemesi.'', null)',
  (select id from projects where repo_id = 904), '50000000-0000-0000-0000-000000000005'), 'ASKIDA', 'Askıda proje düzenlenemez');
select pg_temp.expect_error(format('select public.join_project_by_code(%L, %L, ''bas'', null)',
  (select invite_code from projects where repo_id = 904), '50000000-0000-0000-0000-000000000001'), 'ASKIDA', 'Askıda ekibe katılınamaz');
select pg_temp.expect_error(format('select public.claim_mystery(%L, %L, ''katilimci'')',
  '60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000005'), 'ASKIDA', 'Askıda gizem kaydı yazılamaz');
create temp table t2_job as select * from public.claim_delivery_jobs((select id from projects where repo_id = 904), 1);
select pg_temp.assert_true((select count(*) = 1 from t2_job), 'Askıdan önce kuyruğa giren iş alınabilir');
select pg_temp.assert_true(public.complete_submission((select id from t2_job), (select lease_token from t2_job), 'teslim/' || (select id::text from t2_job) || '.zip', repeat('a',64), 10), 'Askıdan önceki teslim kabul edilir');
select pg_temp.assert_true((select not has_function_privilege('service_role', 'public.enqueue_submission_v0(uuid, uuid, text, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.enqueue_submission(uuid, uuid, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.enqueue_submission(uuid, uuid, text, text, text)', 'execute')), 'İç _v0 fonksiyonu kapalı, sarmalayıcı yalnızca service_role için açık');
update public.events set suspended_at = null, suspended_reason = null where id = '60000000-0000-0000-0000-000000000002';
select pg_temp.assert_true((public.update_project((select id from projects where repo_id = 904), '50000000-0000-0000-0000-000000000005', 'Yeni Ad', 'Yeni Ekip', 'Askı kalkınca düzenleme.', null)) is null, 'Askı kalkınca proje yeniden düzenlenebilir');
update public.events set is_current = false where id = '60000000-0000-0000-0000-000000000002';

rollback;
