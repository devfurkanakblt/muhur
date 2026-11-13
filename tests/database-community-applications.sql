-- Plan 3: başvuru, onay kanıtı, davet ve e-posta kuyruğu. scripts/test-db.mjs'nin ayrı veritabanında çalışır, sonunda geri alınır.
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


insert into auth.users(id) values ('15000000-0000-0000-0000-000000000001'),('15000000-0000-0000-0000-000000000002'),('15000000-0000-0000-0000-000000000003'),('15000000-0000-0000-0000-000000000004');
insert into platform_roles(user_id,login,role) values('15000000-0000-0000-0000-000000000002','head','head_admin');
insert into policy_documents(kind,version,content,content_sha256,status,published_at) select k,'test-1','Örnek belge',encode(sha256(convert_to('Örnek belge','UTF8')),'hex'),'published',clock_timestamp() from unnest(array['platform','data_processing']) k;
insert into policy_requirements(kind,document_id) select kind,id from policy_documents where version='test-1';
create temp table input as select jsonb_build_object('name','Test Topluluğu','slug','test-basvuru','contact_name','Test Kişi','contact_email','test@example.com','contact_phone','+90 555 123 45 67') fields,array(select id from policy_documents where version='test-1') docs;
select pg_temp.expect_error(format('select submit_community_application(%L,''applicant'',%L,%L::jsonb,%L::uuid[])','15000000-0000-0000-0000-000000000001',gen_random_uuid(),(select fields from input),array[gen_random_uuid(),gen_random_uuid()]),'Güncel iki','Başka/eski belge sürümü reddedilir');
create temp table application as select submit_community_application('15000000-0000-0000-0000-000000000001','applicant','15000000-0000-0000-0000-000000000010',fields,docs) id from input;
select pg_temp.assert_true((select count(*)=2 from policy_acceptances where scope_id=(select id from application)),'Başvuru iki ayrı belge kabulü üretir');
select pg_temp.assert_true((select count(*)=1 from mail_outbox where community_id=(select id from application)),'Başvuru mail işi atomik');
select pg_temp.assert_true((select submit_community_application('15000000-0000-0000-0000-000000000001','applicant','15000000-0000-0000-0000-000000000010',fields,docs)=(select id from application) from input),'Aynı request idempotent');
select pg_temp.expect_error(format('select submit_community_application(%L,''applicant'',%L,%L::jsonb,%L::uuid[])','15000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000010',(select fields||'{"name":"Farklı"}'::jsonb from input),(select docs from input)),'farklı','Aynı anahtarla farklı içerik reddedilir');
select pg_temp.expect_error(format('select submit_community_application(%L,''applicant'',%L,%L::jsonb,%L::uuid[])','15000000-0000-0000-0000-000000000001',gen_random_uuid(),(select fields from input),(select docs from input)),'zaten','Çift bekleyen başvuru reddedilir');
select pg_temp.expect_error(format('select review_community_application(%L,%L,''other'',''onaylandi'',null)',(select id from application),'15000000-0000-0000-0000-000000000003'),'YETKI','Başvuruyu yalnız head admin inceler');
select review_community_application((select id from application),'15000000-0000-0000-0000-000000000002','head','onaylandi',null);
select pg_temp.assert_true((select role='owner' from community_members where community_id=(select id from application) and user_id='15000000-0000-0000-0000-000000000001'),'Onay başvuranı sahip yapar');
select review_community_application((select id from application),'15000000-0000-0000-0000-000000000002','head','onaylandi',null);
select pg_temp.assert_true((select count(*)=2 from mail_outbox where community_id=(select id from application)),'Karar tekrarı ikinci mail üretmez');
select pg_temp.expect_error(format('update policy_documents set content=''değişti'' where id=%L',(select docs[1] from input)),'değiştirilemez','Yayınlanan içerik değişmez');
select pg_temp.expect_error('update policy_documents set status=''draft''','değiştirilemez','Yayınlanan belge taslağa dönerek değiştirilemez');
select pg_temp.expect_error('delete from policy_acceptances','değiştirilemez','Onay kanıtı silinemez');
select pg_temp.assert_true(not has_function_privilege('authenticated','submit_community_application(uuid,text,uuid,jsonb,uuid[])','execute'),'İstemci başvuru RPC çalıştıramaz');
select pg_temp.assert_true(not has_table_privilege('service_role','policy_acceptances','insert'),'Servis rolü onayı doğrudan ekleyemez');

create temp table ev as select admin_create_event((select id from application),'Test Etkinliği','plan3-test',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour','15000000-0000-0000-0000-000000000001','applicant') id;
create temp table inv as select create_role_invite('15000000-0000-0000-0000-000000000001','applicant','juri',(select id from ev),repeat('a',64),'jury@example.com',repeat('x',32),gen_random_uuid()) id;
select pg_temp.assert_true((select count(*)=1 from mail_outbox where invite_id=(select id from inv)),'Davet ve e-posta atomik');
select accept_role_invite('15000000-0000-0000-0000-000000000003','LinkedIn Jury','linkedin',repeat('a',64));
select pg_temp.assert_true((select provider='linkedin' from event_jurors where event_id=(select id from ev) and user_id='15000000-0000-0000-0000-000000000003'),'LinkedIn jürisi atanır');
select accept_role_invite('15000000-0000-0000-0000-000000000003','LinkedIn Jury','linkedin',repeat('a',64));
select pg_temp.expect_error(format('select accept_role_invite(%L,''x'',''github'',%L)','15000000-0000-0000-0000-000000000004',repeat('a',64)),'kullanılmış','Başka kişi tüketilmiş daveti kullanamaz');
select pg_temp.expect_error(format('select register_project(%L,%L,''jury'',null,''Test Proje'',''Ekip'',''Yarışma denemesi'',150001,''a/b'',''https://github.com/a/b'',''main'',null,null)',(select id from ev),'15000000-0000-0000-0000-000000000003'),'YARISAMAZ','Jüri aynı etkinliğe katılamaz');
select create_role_invite('15000000-0000-0000-0000-000000000001','applicant','organizator',(select id from application),repeat('b',64),'org@example.com',repeat('x',32),gen_random_uuid());
select pg_temp.expect_error(format('select accept_role_invite(%L,''x'',''linkedin'',%L)','15000000-0000-0000-0000-000000000004',repeat('b',64)),'GitHub','LinkedIn hesabı organizatör olamaz');
select accept_role_invite('15000000-0000-0000-0000-000000000004','organizer','github',repeat('b',64));
select transfer_community_ownership('15000000-0000-0000-0000-000000000001','applicant',(select id from application),'15000000-0000-0000-0000-000000000004');
select pg_temp.assert_true((select count(*)=1 from community_members where community_id=(select id from application) and role='owner'),'Sahiplik devrinde tek sahip kalır');
select pg_temp.expect_error(format('select remove_community_organizer(%L,''old'',%L,%L)','15000000-0000-0000-0000-000000000001',(select id from application),'15000000-0000-0000-0000-000000000004'),'YETKI','Eski sahip artık üye çıkaramaz');
select pg_temp.assert_true(not has_table_privilege('service_role','community_members','insert'),'Servis rolü rolü doğrudan atayamaz');
select pg_temp.assert_true(not has_function_privilege('service_role','lock_role_users(uuid[])','execute'),'İç rol kilidi servise kapalı');

create temp table mail as select * from claim_mail_jobs(1);
select pg_temp.assert_true((select count(*)=1 from mail),'Mail tek lease ile alınır');
select pg_temp.assert_true(not finish_mail_job((select id from mail),gen_random_uuid(),'accepted','message-test'),'Yanlış lease işi tamamlayamaz');
select pg_temp.assert_true(finish_mail_job((select id from mail),(select lease_token from mail),'accepted','message-test'),'Doğru lease tamamlar');
select record_mail_event('event-1','message-test','delivered',clock_timestamp());
select record_mail_event('event-2','message-test','sent',clock_timestamp());
select pg_temp.assert_true((select delivery_state='delivered' from mail_outbox where id=(select id from mail)),'Sıra dışı sent delivered durumunu geri düşürmez');
select pg_temp.assert_true(not record_mail_event('event-1','message-test','delivered',clock_timestamp()),'Tekrar webhook tekilleşir');
-- Kuyruk insert'i başarısızsa karar ve sahiplik aynı transaction'da geri alınır.
insert into communities(id,slug,name,status,applicant_id,contact_email) values('15000000-0000-0000-0000-000000000099','rollback-application','Rollback','beklemede','15000000-0000-0000-0000-000000000003','rollback@example.com');
create function pg_temp.fail_mail() returns trigger language plpgsql as $$ begin raise exception 'Test mail insert hatası'; end $$;
create trigger test_fail_mail before insert on mail_outbox for each row execute function pg_temp.fail_mail();
select pg_temp.expect_error('select review_community_application(''15000000-0000-0000-0000-000000000099'',''15000000-0000-0000-0000-000000000002'',''head'',''onaylandi'',null)','Test mail','Mail insert hatası kararı da geri alır');
select pg_temp.assert_true((select status='beklemede' from communities where slug='rollback-application'),'Başvuru onaylanmamış kalır');
select pg_temp.assert_true(not exists(select 1 from community_members where community_id='15000000-0000-0000-0000-000000000099'),'Başarısız kararda sahip eklenmez');
drop trigger test_fail_mail on mail_outbox;
select review_community_application('15000000-0000-0000-0000-000000000099','15000000-0000-0000-0000-000000000002','head','reddedildi','Kurum bilgilerini tamamla');
select submit_community_application('15000000-0000-0000-0000-000000000003','reapplicant',gen_random_uuid(),fields||jsonb_build_object('slug','test-reapply','previous_application_id','15000000-0000-0000-0000-000000000099'),docs) from input;
select pg_temp.assert_true((select previous_application_id='15000000-0000-0000-0000-000000000099' from communities where slug='test-reapply'),'Retten sonra yeni başvuru eski kaydı koruyarak bağlanır');
select pg_temp.expect_error(format('select submit_community_application(%L,''other'',%L,%L::jsonb,%L::uuid[])','15000000-0000-0000-0000-000000000002',gen_random_uuid(),(select fields||jsonb_build_object('slug','foreign-previous','previous_application_id','15000000-0000-0000-0000-000000000099') from input),(select docs from input)),'Önceki başvuru','Başkasının reddedilmiş başvurusu yeniden kullanılamaz');
-- Süresi dolan/revoke edilmiş davet işçiye verilmez; eski lease sonucu yazamaz.
select create_role_invite('15000000-0000-0000-0000-000000000004','organizer','juri',(select id from ev),repeat('c',64),'expired@example.com',repeat('x',32),gen_random_uuid());
update role_invites set expires_at=clock_timestamp()-interval '1 second' where token_hash=repeat('c',64);
select pg_temp.expect_error(format('select accept_role_invite(%L,''x'',''github'',%L)','15000000-0000-0000-0000-000000000002',repeat('c',64)),'süresi','Süresi dolan davet reddedilir');
select count(*) from claim_mail_jobs(10);
select pg_temp.assert_true((select state='cancelled' and secret_payload is null from mail_outbox where invite_id=(select id from role_invites where token_hash=repeat('c',64))),'Süresi dolan davet maili şifresi silinerek iptal edilir');
update mail_outbox set lease_until=clock_timestamp()-interval '1 second' where state='leased';
select count(*) from claim_mail_jobs(10);
select pg_temp.assert_true(not exists(select 1 from mail_outbox where state='leased'),'Süresi dolan lease otomatik yeniden gönderilmez');
rollback;
