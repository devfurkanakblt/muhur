-- Plan 4 (0018 sonrası): eksik güncel onay yönetim yazmasını DB'de durdurur; katılımcı kaydı enrollment ister.
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

-- 2 sahip, 3 yabancı, 4 eski katılımcı (legacy), 5 yeni katılımcı.
insert into auth.users(id) select ('18000000-0000-0000-0000-00000000000'||n)::uuid from generate_series(2,5) n;
insert into communities(id,slug,name,status) values('18000000-0000-0000-0000-000000000101','plan4-enf','Plan 4 Zorunlu','onaylandi');
insert into community_members(community_id,user_id,github_login,role) values('18000000-0000-0000-0000-000000000101','18000000-0000-0000-0000-000000000002','owner','owner');
insert into events(id,community_id,slug,title,starts_at,deadline) values('18000000-0000-0000-0000-000000000201','18000000-0000-0000-0000-000000000101','plan4-enf','Zorunlu Etkinlik',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day');
-- Aktivasyondan önce açılmış etkinlikteki eski üyelik: legacy enrollment migration'dan gelir gibi kurulur.
insert into participant_enrollments(user_id,event_id,source) values('18000000-0000-0000-0000-000000000004','18000000-0000-0000-0000-000000000201','legacy');
create temp table docs as select kind, document_id id from policy_requirements;

select pg_temp.assert_true(policy_enforcement_enabled(),'0018 zorunluluğu açar');
select pg_temp.expect_error($$select admin_update_event('18000000-0000-0000-0000-000000000201','18000000-0000-0000-0000-000000000003','x','announce','{"announcement":"x"}')$$,'YETKI','Rolü olmayan ONAY değil YETKI alır (rol bilgisi sızmaz)');
select pg_temp.expect_error($$select admin_update_event('18000000-0000-0000-0000-000000000201','18000000-0000-0000-0000-000000000002','owner','announce','{"announcement":"x"}')$$,'ONAY','Onaysız sahip duyuru yazamaz');
select pg_temp.expect_error($$select admin_lock_event('18000000-0000-0000-0000-000000000201','18000000-0000-0000-0000-000000000002','owner')$$,'ONAY','Onaysız sahip kilitleyemez');
select pg_temp.expect_error($$select admin_create_event('18000000-0000-0000-0000-000000000101','Yeni Etkinlik','plan4-enf-2',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days','18000000-0000-0000-0000-000000000002','owner')$$,'ONAY','Onaysız sahip etkinlik oluşturamaz');
select pg_temp.expect_error($$select create_role_invite('18000000-0000-0000-0000-000000000002','owner','juri','18000000-0000-0000-0000-000000000201',repeat('9',64),'j@example.test',repeat('x',32),gen_random_uuid())$$,'ONAY','Onaysız sahip davet oluşturamaz');
select pg_temp.expect_error($$select set_event_terms('18000000-0000-0000-0000-000000000002','owner','18000000-0000-0000-0000-000000000201',null,'https://example.test/k','https://example.test/a',null)$$,'ONAY','Onaysız sahip kural kuramaz');
-- Cron kilidi, head admin askısı ve onay vermek açık kalır.
select pg_temp.assert_true((select count(*)=2 from missing_management_policies('18000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000101')),'Onay ekranı eksik belgeleri okuyabilir');
select suspend_event('18000000-0000-0000-0000-000000000201','18000000-0000-0000-0000-000000000001','head','Zorunluluk testi askısı');
select unsuspend_event('18000000-0000-0000-0000-000000000201','18000000-0000-0000-0000-000000000001','head','Zorunluluk testi askısı');
select pg_temp.assert_true(true,'Head admin askı işlemleri topluluk onayına bağlı değil');
select accept_management_policies('18000000-0000-0000-0000-000000000002','owner','18000000-0000-0000-0000-000000000101',(select array_agg(id) from docs where kind<>'participant'));
select admin_update_event('18000000-0000-0000-0000-000000000201','18000000-0000-0000-0000-000000000002','owner','announce','{"announcement":"Onaydan sonra yazılır"}');
select pg_temp.assert_true((select announcement='Onaydan sonra yazılır' from events where id='18000000-0000-0000-0000-000000000201'),'Onaylı sahip yönetim yazması yapar');
create temp table terms as select set_event_terms('18000000-0000-0000-0000-000000000002','owner','18000000-0000-0000-0000-000000000201',null,'https://example.test/k','https://example.test/a',null) id;
select pg_temp.assert_true(true,'Başlamış ama kural tanımlanmamış eski etkinlikte ilk kural sürümü kurulabilir');

-- Yeni platform sürümü yönetimi yeniden onaya bağlar; eski kabul silinmez.
select publish_policy_document('18000000-0000-0000-0000-000000000001','head',create_policy_draft('18000000-0000-0000-0000-000000000001','head','platform','2026-12',E'Test metni\nplatform 2'),(select id from docs where kind='platform'),'İkinci sürüm');
select pg_temp.expect_error($$select admin_update_event('18000000-0000-0000-0000-000000000201','18000000-0000-0000-0000-000000000002','owner','announce','{"announcement":"y"}')$$,'ONAY','Yeni sürüm yayınlanınca yeniden onay gerekir');
select pg_temp.assert_true((select count(*)=2 from policy_acceptances a join policy_subjects s on s.id=a.subject_id where s.user_id='18000000-0000-0000-0000-000000000002'),'Eski sürüm kabulleri korunur');
select pg_temp.expect_error(format($$select accept_management_policies('18000000-0000-0000-0000-000000000002','owner','18000000-0000-0000-0000-000000000101',%L::uuid[])$$,(select array_agg(id) from docs where kind<>'participant')),'yeni sürümü','Açık kalmış eski formun onayı yeni sürüme taşınmaz');

-- Katılımcı: eski girişler kapalı, kayıtsız üyelik reddedilir; legacy üye çalışmaya devam eder.
select pg_temp.assert_true(not has_function_privilege('service_role','register_project(uuid,uuid,text,text,text,text,text,bigint,text,text,text,text,text)','execute')
 and not has_function_privilege('service_role','join_project_by_code(text,uuid,text,text)','execute')
 and not has_function_privilege('service_role','accept_role_invite(uuid,text,text,text)','execute'),'Kabul denetimini atlatan eski girişler servise kapalı');
select pg_temp.expect_error($$select register_project_v0('18000000-0000-0000-0000-000000000201','18000000-0000-0000-0000-000000000005','new',null,'Atlatma','Atlatma Ekip','Doğrudan gövde çağrısı.',180001,'enf/r1','https://github.com/enf/r1','main',null,null)$$,'ONAY','İç gövde doğrudan çağrılsa da kayıtsız üyelik reddedilir');
select register_project_v0('18000000-0000-0000-0000-000000000201','18000000-0000-0000-0000-000000000004','old',null,'Eski Üye','Eski Ekip','Legacy üye yeni proje açar.',180002,'enf/r2','https://github.com/enf/r2','main',null,null);
select pg_temp.assert_true(true,'Legacy enrollment sahibi aynı etkinlikte devam eder');
select register_project_with_terms('18000000-0000-0000-0000-000000000201','18000000-0000-0000-0000-000000000005','new',null,'Yeni Proje','Yeni Ekip','Onaylı yeni kayıt denemesi.',180003,'enf/r3','https://github.com/enf/r3','main',null,null,(select id from docs where kind='participant'),(select id from terms));
select pg_temp.assert_true((select source='accepted' from participant_enrollments where user_id='18000000-0000-0000-0000-000000000005'),'Zorunluluk açıkken onaylı kayıt çalışır');
rollback;
