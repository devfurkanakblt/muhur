-- Plan 4 (0017 aşaması): belge sürümleri, yayın, yönetim onayı, etkinlik kuralları ve katılımcı kaydı.
-- Zorunluluk henüz kapalıdır; yeni kapsayıcılar yine de açık onay ister. Sonunda geri alınır.
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

-- Kişiler: 1 head admin, 2 sahip, 3 organizatör adayı, 4-5 katılımcı, 6 jüri, 7 yabancı.
insert into auth.users(id) select ('17000000-0000-0000-0000-00000000000'||n)::uuid from generate_series(1,7) n;
insert into platform_roles(user_id,login,role) values('17000000-0000-0000-0000-000000000001','head','head_admin');
insert into communities(id,slug,name,status) values('17000000-0000-0000-0000-000000000101','plan4-a','Plan 4 A','onaylandi'),('17000000-0000-0000-0000-000000000102','plan4-b','Plan 4 B','onaylandi');
insert into community_members(community_id,user_id,github_login,role) values('17000000-0000-0000-0000-000000000101','17000000-0000-0000-0000-000000000002','owner','owner');
insert into events(id,community_id,slug,title,starts_at,deadline) values
 ('17000000-0000-0000-0000-000000000201','17000000-0000-0000-0000-000000000101','plan4-ev','Plan 4 Etkinliği',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days'),
 ('17000000-0000-0000-0000-000000000202','17000000-0000-0000-0000-000000000101','plan4-other','Plan 4 Diğer',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days');

-- Task 1 · taslak ve yayın ----------------------------------------------------------------------
select pg_temp.expect_error($$select create_policy_draft('17000000-0000-0000-0000-000000000002','owner','platform','v1','Metin')$$,'YETKI','Taslağı yalnız head admin hazırlar');
select pg_temp.expect_error($$select create_policy_draft('17000000-0000-0000-0000-000000000001','head','platform','v1',E'Satır\r\nsonu')$$,'normalleştirilmeli','CRLF metin reddedilir');
select pg_temp.expect_error($$select create_policy_draft('17000000-0000-0000-0000-000000000001','head','platform','v1',E'Café')$$,'normalleştirilmeli','NFC olmayan metin reddedilir');
select pg_temp.expect_error($$select create_policy_draft('17000000-0000-0000-0000-000000000001','head','platform','../v1','Metin')$$,'Sürüm','Adreste güvensiz sürüm adı reddedilir');
create temp table docs(kind text primary key, v1 uuid, v2 uuid);
insert into docs(kind,v1) select k, create_policy_draft('17000000-0000-0000-0000-000000000001','head',k,'v1','İlk taslak '||k) from unnest(array['platform','data_processing','participant']) k;
select pg_temp.assert_true((select create_policy_draft('17000000-0000-0000-0000-000000000001','head','platform','v1',E'Platform sözleşmesi\nSürüm 1')=v1 from docs where kind='platform'),'Aynı sürümün taslağı yerinde güncellenir');
select pg_temp.assert_true((select content_sha256=encode(sha256(convert_to(E'Platform sözleşmesi\nSürüm 1','UTF8')),'hex') and status='draft' from policy_documents where id=(select v1 from docs where kind='platform')),'Hash gösterilen UTF-8 metinden hesaplanır');
select pg_temp.expect_error($$update policy_documents set status='published',published_at=clock_timestamp() where version='v1'$$,'denetimli yayın','Taslak doğrudan güncellemeyle yayınlanamaz');
select pg_temp.expect_error(format($$select publish_policy_document('17000000-0000-0000-0000-000000000002','owner',%L,null,'Yayın gerekçesi')$$,(select v1 from docs where kind='platform')),'YETKI','Yayını yalnız head admin yapar');
select pg_temp.expect_error(format($$select publish_policy_document('17000000-0000-0000-0000-000000000001','head',%L,null,'')$$,(select v1 from docs where kind='platform')),'gerekçe','Yayın gerekçe ister');
select pg_temp.expect_error(format($$select publish_policy_document('17000000-0000-0000-0000-000000000001','head',%L,gen_random_uuid(),'Yayın gerekçesi')$$,(select v1 from docs where kind='platform')),'değişmiş','Beklenen mevcut sürüm tutmazsa yayın reddedilir');
select publish_policy_document('17000000-0000-0000-0000-000000000001','head',v1,null,'İlk yayın') from docs;
select pg_temp.assert_true((select count(*)=3 from policy_requirements r join docs d on d.v1=r.document_id),'Yayın işaretçiyi atomik kurar');
select publish_policy_document('17000000-0000-0000-0000-000000000001','head',v1,null,'İlk yayın') from docs where kind='platform';
select pg_temp.assert_true((select count(*)=3 from admin_audit where action='policy_published'),'Aynı yayının tekrarı idempotent ve ikinci kayıt üretmez');
select pg_temp.expect_error(format($$update policy_documents set content='değişti' where id=%L$$,(select v1 from docs where kind='platform')),'değiştirilemez','Yayınlanan içerik değişmez');
select pg_temp.expect_error(format($$delete from policy_documents where id=%L$$,(select v1 from docs where kind='platform')),'değiştirilemez','Yayınlanan belge silinmez');
select pg_temp.expect_error($$select create_policy_draft('17000000-0000-0000-0000-000000000001','head','platform','v1','Yeni metin')$$,'yeni bir sürüm','Yayınlanan sürüm numarası yeniden kullanılamaz');

-- Task 2 · yönetim onayı ------------------------------------------------------------------------
select pg_temp.assert_true((select count(*)=2 from missing_management_policies('17000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000101')),'Sahibin onaylaması gereken iki güncel belge listelenir');
select pg_temp.expect_error(format($$select accept_management_policies('17000000-0000-0000-0000-000000000002','owner','17000000-0000-0000-0000-000000000101',array[%L]::uuid[])$$,(select v1 from docs where kind='platform')),'yeni sürümü','Eksik belge setiyle onay reddedilir');
select pg_temp.expect_error(format($$select accept_management_policies('17000000-0000-0000-0000-000000000007','x','17000000-0000-0000-0000-000000000101',%L::uuid[])$$,(select array_agg(v1) from docs where kind<>'participant')),'YETKI','Üye olmayan topluluk adına onay veremez');
select accept_management_policies('17000000-0000-0000-0000-000000000002','owner','17000000-0000-0000-0000-000000000101',(select array_agg(v1)||array_agg(v1) from docs where kind<>'participant'));
select accept_management_policies('17000000-0000-0000-0000-000000000002','owner','17000000-0000-0000-0000-000000000101',(select array_agg(v1) from docs where kind<>'participant'));
select pg_temp.assert_true((select count(*)=2 from policy_acceptances a join policy_subjects s on s.id=a.subject_id where s.user_id='17000000-0000-0000-0000-000000000002'),'Çift gönderim tek kabul satırı üretir');
select pg_temp.assert_true(not exists(select 1 from missing_management_policies('17000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000101')),'Onay sonrası eksik belge kalmaz');
select pg_temp.assert_true((select count(*)=2 from missing_management_policies('17000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000102')),'Başka topluluğun kabulü bu topluluk için geçmez');
select pg_temp.expect_error(format($$insert into policy_acceptances(subject_id,document_id,scope_kind,scope_id) select id,%L,'community','17000000-0000-0000-0000-000000000101' from policy_subjects limit 1$$,(select v1 from docs where kind='participant')),'kapsamda','Katılımcı belgesi topluluk kapsamında kabul edilemez');

-- Organizatör daveti: rol ve belge kabulü aynı transaction.
select create_role_invite('17000000-0000-0000-0000-000000000002','owner','organizator','17000000-0000-0000-0000-000000000101',repeat('7',64),'org@example.test',repeat('x',32),gen_random_uuid());
select pg_temp.expect_error(format($$select accept_role_invite_with_policies('17000000-0000-0000-0000-000000000003','org','github',%L,array[]::uuid[])$$,repeat('7',64)),'yeni sürümü','Belgesiz organizatör kabulü reddedilir');
select pg_temp.assert_true(not exists(select 1 from community_members where user_id='17000000-0000-0000-0000-000000000003'),'Reddedilen kabul rol de kurmaz (rollback)');
select accept_role_invite_with_policies('17000000-0000-0000-0000-000000000003','org','github',repeat('7',64),(select array_agg(v1) from docs where kind<>'participant'));
select pg_temp.assert_true((select role='organizator' from community_members where user_id='17000000-0000-0000-0000-000000000003') and not exists(select 1 from missing_management_policies('17000000-0000-0000-0000-000000000003','17000000-0000-0000-0000-000000000101')),'Organizatör rolü ve onayları birlikte kurulur');

-- Etkinlik kuralları ----------------------------------------------------------------------------
select pg_temp.expect_error($$select set_event_terms('17000000-0000-0000-0000-000000000007','x','17000000-0000-0000-0000-000000000201',null,'https://example.test/kurallar','https://example.test/aydinlatma',null)$$,'YETKI','Kuralları yalnız etkinlik yöneticisi kurar');
select pg_temp.expect_error($$select set_event_terms('17000000-0000-0000-0000-000000000002','owner','17000000-0000-0000-0000-000000000201',null,'http://example.test/kurallar','https://example.test/aydinlatma',null)$$,'HTTPS','HTTP bağlantı reddedilir');
create temp table terms as select set_event_terms('17000000-0000-0000-0000-000000000002','owner','17000000-0000-0000-0000-000000000201',null,'https://example.test/kurallar','https://example.test/aydinlatma',null) v1;
select pg_temp.expect_error($$select set_event_terms('17000000-0000-0000-0000-000000000002','owner','17000000-0000-0000-0000-000000000201',null,'https://example.test/k2','https://example.test/a2',null)$$,'başka bir yönetici','Eski sürüm beklentisiyle kural değişikliği reddedilir');
alter table terms add column v2 uuid;
update terms set v2=set_event_terms('17000000-0000-0000-0000-000000000002','owner','17000000-0000-0000-0000-000000000201',v1,'https://example.test/k2','https://example.test/a2',repeat('b',64));
select pg_temp.assert_true((select current_terms_version_id=(select v2 from terms) and rules_url='https://example.test/k2' from events where id='17000000-0000-0000-0000-000000000201'),'Başlangıç ve kayıt öncesi yeni sürüm kurulur');
select pg_temp.assert_true((select rules_url='https://example.test/kurallar' from event_terms_versions where id=(select v1 from terms)),'Eski kural sürümü olduğu gibi kalır');
select pg_temp.expect_error($$update event_terms_versions set rules_url='https://evil.test/' $$,'değiştirilemez','Kural sürümü değiştirilemez');
select pg_temp.expect_error(format($$update events set current_terms_version_id=%L where id='17000000-0000-0000-0000-000000000202'$$,(select v1 from terms)),'events_current_terms_own','Başka etkinliğin kural sürümü bağlanamaz');

-- Task 3 · katılımcı kaydı ----------------------------------------------------------------------
create function pg_temp.register(p_user uuid, p_repo bigint, p_doc uuid, p_terms uuid, p_event uuid default '17000000-0000-0000-0000-000000000201') returns uuid language sql as $$
 select id from register_project_with_terms(p_event,p_user,'u',null,'Plan Proje','Plan Ekip','Plan 4 kayıt denemesi.',p_repo,'plan/r'||p_repo,'https://github.com/plan/r'||p_repo,'main',null,null,p_doc,p_terms)
$$;
select pg_temp.expect_error($$select pg_temp.register('17000000-0000-0000-0000-000000000004',170001,null,null)$$,'ayrı ayrı','Onay vermeden ilk kayıt reddedilir');
select pg_temp.expect_error(format($$select pg_temp.register('17000000-0000-0000-0000-000000000004',170001,%L,%L)$$,(select v1 from docs where kind='participant'),(select v1 from terms)),'yeni sürümü','Eski etkinlik kuralı sürümüyle kayıt reddedilir');
select pg_temp.expect_error(format($$select pg_temp.register('17000000-0000-0000-0000-000000000004',170001,%L,%L)$$,(select v1 from docs where kind='platform'),(select v2 from terms)),'yeni sürümü','Yanlış belge türüyle kayıt reddedilir');
select pg_temp.expect_error(format($$select pg_temp.register('17000000-0000-0000-0000-000000000004',170001,%L,%L,'17000000-0000-0000-0000-000000000202')$$,(select v1 from docs where kind='participant'),(select v2 from terms)),'kuralları henüz','Kuralları olmayan etkinlikte yapılandırma mesajı verilir');
select pg_temp.assert_true(not exists(select 1 from policy_acceptances a join policy_subjects s on s.id=a.subject_id where s.user_id='17000000-0000-0000-0000-000000000004'),'Başarısız kayıt kabul kanıtı bırakmaz');
create temp table proj as select pg_temp.register('17000000-0000-0000-0000-000000000004',170001,(select v1 from docs where kind='participant'),(select v2 from terms)) id;
select pg_temp.assert_true((select source='accepted' and participant_document_id=(select v1 from docs where kind='participant') and event_terms_version_id=(select v2 from terms) and accepted_at is not null from participant_enrollments where user_id='17000000-0000-0000-0000-000000000004'),'Kayıt, iki ayrı kabul ve enrollment birlikte oluşur');
select pg_temp.assert_true((select count(*)=1 from event_terms_acceptances where user_id='17000000-0000-0000-0000-000000000004') and (select count(*)=1 from policy_acceptances a join policy_subjects s on s.id=a.subject_id where s.user_id='17000000-0000-0000-0000-000000000004' and a.scope_kind='event'),'Platform ve etkinlik kuralı ayrı kanıt satırlarıdır');
select pg_temp.expect_error($$select set_event_terms('17000000-0000-0000-0000-000000000002','owner','17000000-0000-0000-0000-000000000201',(select v2 from terms),'https://example.test/k3','https://example.test/a3',null)$$,'ilk katılımcı','İlk kayıttan sonra kurallar değiştirilemez');
select create_role_invite('17000000-0000-0000-0000-000000000002','owner','juri','17000000-0000-0000-0000-000000000201',repeat('8',64),'jury@example.test',repeat('x',32),gen_random_uuid());
select accept_role_invite('17000000-0000-0000-0000-000000000006','jury','github',repeat('8',64));
select pg_temp.expect_error(format($$select pg_temp.register('17000000-0000-0000-0000-000000000006',170002,%L,%L)$$,(select v1 from docs where kind='participant'),(select v2 from terms)),'YARISAMAZ','Organizatör/jüri engeli onaydan önce gelir');

-- Ekip katılımı: aynı atomiklik; ayrılıp dönen mevcut enrollment'ı kullanır.
select pg_temp.expect_error(format($$select join_project_with_terms(%L,'17000000-0000-0000-0000-000000000005','b',null,null,null)$$,(select invite_code from projects where id=(select id from proj))),'ayrı ayrı','Onaysız ekip katılımı reddedilir');
select join_project_with_terms((select invite_code from projects where id=(select id from proj)),'17000000-0000-0000-0000-000000000005','b',null,(select v1 from docs where kind='participant'),(select v2 from terms));
select pg_temp.assert_true((select source='accepted' from participant_enrollments where user_id='17000000-0000-0000-0000-000000000005'),'Ekip katılımı enrollment üretir');
select leave_project('17000000-0000-0000-0000-000000000201','17000000-0000-0000-0000-000000000005');
select pg_temp.assert_true(exists(select 1 from participant_enrollments where user_id='17000000-0000-0000-0000-000000000005'),'Ekipten ayrılmak enrollment silmez');

-- Yeni katılımcı belge sürümü mevcut kaydı/teslimi engellemez; yeniden katılım önceki enrollment'la olur.
update docs set v2=create_policy_draft('17000000-0000-0000-0000-000000000001','head','participant','v2','Katılımcı koşulları 2') where kind='participant';
select publish_policy_document('17000000-0000-0000-0000-000000000001','head',v2,v1,'İkinci sürüm') from docs where kind='participant';
select pg_temp.assert_true((select status='retired' from policy_documents where id=(select v1 from docs where kind='participant')),'Önceki sürüm emekliye ayrılır, silinmez');
select pg_temp.expect_error(format($$update policy_documents set status='published' where id=%L$$,(select v1 from docs where kind='participant')),'yeniden yayınlanamaz','Emekli sürüm geri yayınlanamaz');
select pg_temp.expect_error(format($$update policy_requirements set document_id=%L where kind='participant'$$,(select v1 from docs where kind='participant')),'Geçersiz belge','İşaretçi emekli sürüme döndürülemez');
select update_project((select id from proj),'17000000-0000-0000-0000-000000000004','Plan Proje 2','Plan Ekip','Plan 4 kayıt denemesi 2.',null);
select pg_temp.assert_true((select name='Plan Proje 2' from projects where id=(select id from proj)),'Yeni belge sürümü mevcut yarışmacının güncellemesini engellemez');
select join_project_with_terms((select invite_code from projects where id=(select id from proj)),'17000000-0000-0000-0000-000000000005','b',null,null,null);
select pg_temp.assert_true((select participant_document_id=(select v1 from docs where kind='participant') from participant_enrollments where user_id='17000000-0000-0000-0000-000000000005'),'Aynı etkinliğe yeniden katılım önceki enrollment ile olur');
select pg_temp.expect_error(format($$select pg_temp.register('17000000-0000-0000-0000-000000000007',170003,%L,%L)$$,(select v1 from docs where kind='participant'),(select v2 from terms)),'yeni sürümü','Form açıkken yayınlanan yeni sürüm eski onayla kabul edilmez');

-- Eski giriş (zorunluluk kapalı) legacy işaretler; kabul tarihi uydurmaz.
select register_project('17000000-0000-0000-0000-000000000202','17000000-0000-0000-0000-000000000007','x',null,'Eski Proje','Eski Ekip','Eski giriş denemesi.',170004,'plan/old','https://github.com/plan/old','main',null,null);
select pg_temp.assert_true((select source='legacy' and accepted_at is null and participant_document_id is null from participant_enrollments where user_id='17000000-0000-0000-0000-000000000007' and event_id='17000000-0000-0000-0000-000000000202'),'Eski girişten gelen üyelik legacy işaretlenir');
select pg_temp.expect_error($$update participant_enrollments set source='accepted'$$,'değiştirilemez','Enrollment kaydı değiştirilemez');
select pg_temp.expect_error($$delete from event_terms_acceptances$$,'değiştirilemez','Etkinlik kuralı kabulü silinemez');

-- Yetkiler ------------------------------------------------------------------------------------------
select pg_temp.assert_true(not has_function_privilege('service_role','assert_management_policies(uuid,uuid)','execute'),'Yönetim kapısı tek başına servise açık değil');
select pg_temp.assert_true(not has_function_privilege('service_role','ensure_participant_enrollment(uuid,uuid,uuid,uuid)','execute'),'Enrollment iç yardımcısı servise kapalı');
select pg_temp.assert_true(not has_function_privilege('authenticated','register_project_with_terms(uuid,uuid,text,text,text,text,text,bigint,text,text,text,text,text,uuid,uuid)','execute'),'İstemci kayıt kapsayıcısını çağıramaz');
select pg_temp.assert_true(has_function_privilege('service_role','join_project_with_terms(text,uuid,text,text,uuid,uuid)','execute'),'Sunucu yeni katılım girişini çağırır');
select pg_temp.assert_true(not has_table_privilege('service_role','participant_enrollments','insert') and not has_table_privilege('service_role','policy_requirements','update'),'Servis rolü enrollment ekleyemez, işaretçiyi doğrudan değiştiremez');
select pg_temp.assert_true(not policy_enforcement_enabled(),'0017 zorunluluğu kapalı bırakır');
select admin_update_event('17000000-0000-0000-0000-000000000202','17000000-0000-0000-0000-000000000002','owner','announce','{"announcement":"Zorunluluk kapalıyken yönetim sürer"}');
select pg_temp.assert_true(true,'Zorunluluk kapalıyken eski yönetim akışı çalışır');
rollback;
