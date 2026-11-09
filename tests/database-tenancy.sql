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

-- Bölüm 3 · yönetim tarafı: etkinlik kapsamı ve askıya alma ------------------------------------
-- 50..06: sahiplik devri hedefi. B ödülü ve B oyu kurulum için koruma tetikleyicileri kapatılarak yazılır.
insert into auth.users(id) values ('50000000-0000-0000-0000-000000000006');
alter table public.awards disable trigger awards_guard;
insert into public.awards(id, event_id, project_id, title, reason)
values ('80000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', (select id from projects where repo_id = 904), 'B Ödülü', 'B topluluğunun verdiği ödül.');
alter table public.awards enable trigger awards_guard;
alter table public.votes disable trigger votes_guard;
insert into public.votes(event_id, user_id, project_id, github_login)
values ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000005', (select id from projects where repo_id = 903), 'katilimci');
alter table public.votes enable trigger votes_guard;
insert into public.mascot_name_proposals(event_id, author_id, author_login, name)
values ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'deu-org', 'Pamuk');

-- Topluluklar arası çapraz istek.
select pg_temp.expect_error($c$ select public.admin_lock_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','org') $c$, 'YETKI', 'DEÜ organizatörü B etkinliğini kilitleyemez');
select pg_temp.expect_error(format('select public.admin_add_award(%L, %L, ''Çapraz'', ''Başka topluluğa ödül denemesi.'', %L, ''org'')',
  '60000000-0000-0000-0000-000000000002', (select id from projects where repo_id = 904), '50000000-0000-0000-0000-000000000002'), 'YETKI', 'Başka topluluğa ödül verilemez');
select pg_temp.expect_error(format('select public.admin_add_award(%L, %L, ''Platform'', ''Head admin ödül denemesi.'', %L, ''bas'')',
  '60000000-0000-0000-0000-000000000002', (select id from projects where repo_id = 904), '50000000-0000-0000-0000-000000000001'), 'YETKI', 'Head admin başka topluluğa ödül veremez');
select pg_temp.assert_true(not public.admin_remove_award('80000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'org'), 'Kendi etkinlik id''si ile başka topluluğun ödülü bulunamaz');
select pg_temp.assert_true((select count(*) = 1 from awards where id = '80000000-0000-0000-0000-000000000001'), 'Yanlış etkinlik id ile başka topluluğun ödülü silinemez');
select pg_temp.expect_error($c$ select public.admin_remove_award('80000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','org') $c$, 'YETKI', 'Başka topluluğun etkinlik id''siyle ödül silinemez');
select pg_temp.expect_error($c$ select public.admin_update_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','bas','deadline',jsonb_build_object('deadline', clock_timestamp() + interval '3 hours')) $c$, 'YETKI', 'Head admin etkinlik zamanını değiştiremez');
select pg_temp.expect_error($c$ select public.admin_update_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004','b-juri','announcement','{"announcement":"Jüri duyurusu"}') $c$, 'YETKI', 'Jüri etkinliği yönetemez');
select public.admin_update_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003','b-sahip','announcement','{"announcement":"B duyurusu"}');
select pg_temp.assert_true((select announcement = 'B duyurusu' from events where id = '60000000-0000-0000-0000-000000000002'), 'Topluluk sahibi kendi etkinliğini yönetir');

-- Etkinlik askısı.
select pg_temp.expect_error($c$ select public.suspend_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','org','Yetkisiz askı denemesi') $c$, 'YETKI', 'Organizatör askıya alamaz');
select pg_temp.expect_error($c$ select public.suspend_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','bas','') $c$, 'gerekçe', 'Gerekçesiz askı reddedilir');
select pg_temp.expect_error($c$ select public.suspend_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','bas',repeat('x',501)) $c$, 'gerekçe', 'Çok uzun gerekçe reddedilir');
select public.suspend_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','bas','Kural ihlali incelemesi');
select pg_temp.assert_true((select suspended_at is not null and suspended_reason = 'Kural ihlali incelemesi' and suspended_by = '50000000-0000-0000-0000-000000000001' from events where id = '60000000-0000-0000-0000-000000000002'), 'Askı etkinliğe yazılır');
select pg_temp.expect_error($c$ select public.admin_update_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003','b-sahip','announcement','{"announcement":"Askıda duyuru"}') $c$, 'ASKIDA', 'Askıdaki etkinlikte organizatör de yönetemez');
select pg_temp.assert_true((select count(*) = 1 from admin_audit where action = 'event_suspended' and reason = 'Kural ihlali incelemesi' and event_id = '60000000-0000-0000-0000-000000000002'), 'Askı gerekçesiyle kayda girer');
-- Askıda katılımcı salt okunur: oy geri çekme, maskot önerisi/düzenlemesi ve maskot oyu da durur.
alter table public.votes disable trigger votes_guard;
select pg_temp.expect_error($c$ delete from votes where event_id = '60000000-0000-0000-0000-000000000002' and user_id = '50000000-0000-0000-0000-000000000005' $c$, 'ASKIDA', 'Askıda oy geri çekilemez');
alter table public.votes enable trigger votes_guard;
select pg_temp.expect_error($c$ insert into mascot_name_proposals(event_id, author_id, author_login, name) values ('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000005','katilimci','Tarçın') $c$, 'ASKIDA', 'Askıda maskot ismi önerilemez');
select pg_temp.expect_error($c$ update mascot_name_proposals set name = 'Pamukçuk' where event_id = '60000000-0000-0000-0000-000000000002' and author_id = '50000000-0000-0000-0000-000000000002' $c$, 'ASKIDA', 'Askıda maskot önerisi düzenlenemez');
update public.mascot_naming_rounds set phase = 'oylama' where event_id = '60000000-0000-0000-0000-000000000002';
select pg_temp.expect_error($c$ insert into mascot_name_votes(event_id, voter_id, voter_login, proposal_id) select event_id, '50000000-0000-0000-0000-000000000005', 'katilimci', id from mascot_name_proposals where event_id = '60000000-0000-0000-0000-000000000002' and name = 'Pamuk' $c$, 'ASKIDA', 'Askıda maskot oyu verilemez');
select pg_temp.expect_error($c$ select public.unsuspend_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003','b-sahip','Askıyı kaldırma denemesi') $c$, 'YETKI', 'Topluluk sahibi askıyı kaldıramaz');
select public.unsuspend_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','bas','İnceleme tamamlandı');
select pg_temp.assert_true((select suspended_at is null and suspended_reason is null and suspended_by is null from events where id = '60000000-0000-0000-0000-000000000002'), 'Askı kalkar');
select pg_temp.assert_true((select count(*) = 1 from admin_audit where action = 'event_unsuspended' and reason = 'İnceleme tamamlandı'), 'Askının kalkması kayda girer');
insert into mascot_name_votes(event_id, voter_id, voter_login, proposal_id)
select event_id, '50000000-0000-0000-0000-000000000005', 'katilimci', id from mascot_name_proposals where event_id = '60000000-0000-0000-0000-000000000002' and name = 'Pamuk';
select pg_temp.assert_true((select count(*) = 1 from mascot_name_votes where event_id = '60000000-0000-0000-0000-000000000002'), 'Askı kalkınca maskot oyu verilir');
alter table public.votes disable trigger votes_guard;
delete from votes where event_id = '60000000-0000-0000-0000-000000000002' and user_id = '50000000-0000-0000-0000-000000000005';
alter table public.votes enable trigger votes_guard;
select pg_temp.assert_true((select count(*) = 0 from votes where event_id = '60000000-0000-0000-0000-000000000002'), 'Askı kalkınca oy geri çekilir');

-- Topluluk askısı: topluluğun bütün etkinlikleri yönetime kapanır.
select pg_temp.expect_error($c$ select public.suspend_community('70000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003','b-sahip','Yetkisiz topluluk askısı') $c$, 'YETKI', 'Topluluk sahibi topluluğu askıya alamaz');
select public.suspend_community('70000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','bas','Topluluk incelemesi');
select pg_temp.assert_true((select status = 'askida' and suspended_reason = 'Topluluk incelemesi' from communities where id = '70000000-0000-0000-0000-000000000002'), 'Topluluk askıya alınır');
select pg_temp.assert_true((select count(*) = 1 from admin_audit where action = 'community_suspended' and before->>'community' = '70000000-0000-0000-0000-000000000002' and reason = 'Topluluk incelemesi'), 'Topluluk askısı kayda girer');
select pg_temp.expect_error($c$ select public.admin_switch_event('60000000-0000-0000-0000-000000000002','B Yeni','b-yeni',clock_timestamp(),clock_timestamp()+interval '2 hours','50000000-0000-0000-0000-000000000003','b-sahip') $c$, 'ASKIDA', 'Askıdaki topluluk yeni etkinlik açamaz');
select pg_temp.expect_error($c$ select public.admin_update_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003','b-sahip','announcement','{"announcement":"Askıda duyuru"}') $c$, 'ASKIDA', 'Askıdaki topluluk etkinliğini yönetemez');
select pg_temp.expect_error($c$ select public.suspend_community('70000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','bas','İkinci askı') $c$, 'onaylı', 'Askıdaki topluluk yeniden askıya alınmaz');
select public.unsuspend_community('70000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','bas','Topluluk incelemesi bitti');
select pg_temp.assert_true((select status = 'onaylandi' and suspended_reason is null from communities where id = '70000000-0000-0000-0000-000000000002'), 'Topluluk askısı kalkar');
select pg_temp.assert_true((select count(*) = 1 from admin_audit where action = 'community_unsuspended'), 'Topluluk askısının kalkması kayda girer');

-- Anonimleştirme ve sahiplik devri yalnızca head admin'e açık.
select pg_temp.expect_error($c$ select public.anonymize_user('50000000-0000-0000-0000-000000000005','50000000-0000-0000-0000-000000000002','org','KVKK silme başvurusu') $c$, 'YETKI', 'Organizatör anonimleştiremez');
select pg_temp.assert_true(public.anonymize_user('50000000-0000-0000-0000-000000000006','50000000-0000-0000-0000-000000000001','bas','KVKK silme başvurusu') = 0, 'Head admin anonimleştirebilir');
select pg_temp.expect_error($c$ select public.set_community_owner('70000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000006','yeni-sahip','50000000-0000-0000-0000-000000000003','b-sahip','Sahiplik devri denemesi') $c$, 'YETKI', 'Topluluk sahibi sahipliği platform yetkisiyle devredemez');
select pg_temp.expect_error($c$ select public.set_community_owner('70000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000006','yeni-sahip','50000000-0000-0000-0000-000000000001','bas','') $c$, 'gerekçe', 'Gerekçesiz sahiplik devri reddedilir');
select public.set_community_owner('70000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000006','yeni-sahip','50000000-0000-0000-0000-000000000001','bas','Sahip hesabını kaybetti');
select pg_temp.assert_true(public.event_role('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000006') = 'owner'
  and public.event_role('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003') = 'organizator', 'Yeni sahip atanır, eski sahip organizatör olur');
select pg_temp.assert_true((select count(*) = 1 from admin_audit where action = 'community_owner_set' and reason = 'Sahip hesabını kaybetti'), 'Sahiplik devri kayda girer');

-- Yeni etkinlik aynı topluluğa bağlanır.
update public.events set is_current = false where is_current;
update public.events set is_current = true where id = '60000000-0000-0000-0000-000000000001';
select public.lock_delivery_event('60000000-0000-0000-0000-000000000001', 'test', true);
create temp table t3_new as select public.admin_switch_event('60000000-0000-0000-0000-000000000001','DEÜ Yeni','deu-yeni',clock_timestamp(),clock_timestamp()+interval '2 hours','50000000-0000-0000-0000-000000000002','deu-org') as id;
select pg_temp.assert_true((select community_id = (select id from communities where slug = 'deu-csai') and is_current from events where id = (select id from t3_new)), 'Yeni etkinlik aynı topluluğa bağlanır');

-- Erişim: iç _v0 fonksiyonları kapalı, sarmalayıcılar ve yeni RPC'ler yalnızca service_role için açık.
select pg_temp.assert_true((select not has_function_privilege('service_role', 'public.admin_update_event_v0(uuid, uuid, text, text, jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.anonymize_user_v0(uuid, uuid, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.admin_update_event(uuid, uuid, text, text, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.suspend_event(uuid, uuid, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.set_community_owner(uuid, uuid, text, uuid, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.suspend_event(uuid, uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.suspend_community(uuid, uuid, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_switch_event(uuid, text, text, timestamptz, timestamptz, uuid, text)', 'execute')),
  'Yönetim fonksiyonlarının erişimi doğru');

-- Son: askıdaki etkinlik süre dolunca yine kilitlenir (etkinliği kalıcı kilitler, bu yüzden en sonda).
select public.suspend_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','bas','İkinci inceleme');
select pg_temp.assert_true(public.lock_delivery_event('60000000-0000-0000-0000-000000000002','cron',true), 'Askıdaki etkinlik kilitlenebilir (süre işler)');
select pg_temp.assert_true((select locked_at is not null from events where id = '60000000-0000-0000-0000-000000000002'), 'Askıdaki etkinliğin kilidi yazılır');

rollback;
