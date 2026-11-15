-- Plan 4 Task 4: anonimleştirme kişi ↔ özne eşlemesini ayırır; kabul kanıtı değişmez ve silinmez.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
insert into auth.users(id) values('19000000-0000-0000-0000-000000000002');
insert into communities(id,slug,name,status) values('19000000-0000-0000-0000-000000000101','plan4-priv','Plan 4 Gizlilik','onaylandi');
insert into community_members(community_id,user_id,github_login,role) values('19000000-0000-0000-0000-000000000101','19000000-0000-0000-0000-000000000002','owner','owner');
select accept_management_policies('19000000-0000-0000-0000-000000000002','owner','19000000-0000-0000-0000-000000000101',(select array_agg(document_id) from policy_requirements where kind<>'participant'));
create temp table before as select a.id,a.subject_id,a.document_id,a.accepted_at from policy_acceptances a join policy_subjects s on s.id=a.subject_id where s.user_id='19000000-0000-0000-0000-000000000002';
select anonymize_user('19000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000001','head','Kişinin silme talebi');
select pg_temp.assert_true(not exists(select 1 from policy_subjects where user_id='19000000-0000-0000-0000-000000000002'),'Anonimleştirme kişi ↔ özne eşlemesini ayırır');
select pg_temp.assert_true((select count(*)=2 from policy_acceptances a join before b using(id) where a.subject_id=b.subject_id and a.document_id=b.document_id and a.accepted_at=b.accepted_at),'Kabul kanıtı subject_id ve tarihiyle sabit kalır');
select pg_temp.assert_true((select detached_at is not null from policy_subjects where id=(select subject_id from before limit 1)),'Ayrılma zamanı kayda geçer');
select pg_temp.assert_true(not exists(select 1 from information_schema.columns where table_name in ('policy_acceptances','event_terms_acceptances','participant_enrollments') and column_name in ('ip','user_agent','token','access_token')),'Kanıt tablolarında IP, user agent veya token yok');
select pg_temp.assert_true(not exists(select 1 from pg_constraint c where c.contype='f' and c.confdeltype='c' and c.conrelid in ('policy_acceptances'::regclass,'event_terms_acceptances'::regclass,'participant_enrollments'::regclass,'policy_subjects'::regclass)),'Kullanıcı silinince kanıtı zincirleme silen FK yok');
rollback;
