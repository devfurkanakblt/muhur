-- Yalnızca izole muhur_audit_* veritabanı. Beklenmeyen davranışı doğrular; düzeltme uygulamaz.
begin;
create function pg_temp.observed(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'NOT REPRODUCED: %', label; end if;
  raise notice 'OBSERVED: %', label;
end $$;
insert into auth.users(id) select ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,5) n;
update events set is_current=false where is_current;
insert into events(id,slug,title,starts_at,deadline,is_current)
values('10000000-0000-0000-0000-000000000001','audit-open','Audit Test',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true);
create temp table fixture as select id from register_project(
  '10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','owner',null,
  'Audit Proje','Audit Ekip','Audit icin ornek proje.',123,'owner/repo','https://github.com/owner/repo','main',null,repeat('a',40));
create temp table first_job as select * from claim_delivery_jobs((select id from fixture),1);
select complete_submission(id,lease_token,'teslim/'||id::text||'.zip',repeat('b',64),100) from first_job;
select enqueue_submission((select id from fixture),'00000000-0000-0000-0000-000000000001',repeat('a',40),'main','owner/repo');
create temp table second_job as select * from claim_delivery_jobs((select id from fixture),1);
select complete_submission(id,lease_token,'teslim/'||id::text||'.zip',repeat('b',64),100) from second_job;
select pg_temp.observed((select count(*)=2 from submissions where project_id=(select id from fixture)),
 'A05: Ayni SHA/hash icin iki farkli kalici teslim kaydi ve arsiv yolu olustu; tekillik/kota yok.');

create temp table pending_version as select enqueue_submission((select id from fixture),
 '00000000-0000-0000-0000-000000000001',repeat('c',40),'main','owner/repo') as id;
select pg_temp.observed(enqueue_submission((select id from fixture),
 '00000000-0000-0000-0000-000000000001',repeat('d',40),'main','owner/repo')=(select id from pending_version),
 'A08: Yeni SHA istegi mevcut eski SHA isinin kimligiyle sessizce basarili donduruldu.');
select pg_temp.observed((select sha=repeat('c',40) from delivery_jobs where id=(select id from pending_version)),
 'A08: Yeni istenen SHA kuyruğa eklenmedi; eski SHA korundu.');

insert into project_members(project_id,event_id,user_id,github_login,role)
select id,'10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','member','member' from fixture;
-- Sunucu aksiyonu once uyelik okur; arada kurucu uyeyi cikarir.
select pg_temp.observed(exists(select 1 from project_members where project_id=(select id from fixture)
 and user_id='00000000-0000-0000-0000-000000000002'),'A03: Istek basinda uye yetkili.');
delete from project_members where project_id=(select id from fixture) and user_id='00000000-0000-0000-0000-000000000002';
update projects set summary='Uyelik kaldirildiktan sonra eski istek bu metni yazdi.' where id=(select id from fixture);
select pg_temp.observed((select summary like 'Uyelik kaldirildiktan%' from projects where id=(select id from fixture)),
 'A03: Uyelik kaldirilinca da onceden yetki kontrolu yapilmis service-role guncellemesi kabul edildi.');

-- joinProject once kodla proje kimligini okur, sonra ayri INSERT yapar.
update projects set invite_code='renewed-code-fixture' where id=(select id from fixture);
insert into project_members(project_id,event_id,user_id,github_login,role)
select id,'10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','stale-invite','member' from fixture;
select pg_temp.observed(exists(select 1 from project_members where project_id=(select id from fixture)
 and user_id='00000000-0000-0000-0000-000000000003'),
 'A04: Kod yenilendikten sonra eski okumanin proje kimligiyle uyelik INSERT kabul edildi.');

create temp table doomed as select id from register_project(
  '10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','owner2',null,
  'Silinen Proje','Audit Ekip2','Kurucu yarisi test projesi.',124,'owner2/repo','https://github.com/owner2/repo','main');
insert into project_members(project_id,event_id,user_id,github_login,role)
select id,'10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','new-owner','member' from doomed;
select transfer_project_owner((select id from doomed),'00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005');
delete from projects where id=(select id from doomed);
select pg_temp.observed(not exists(select 1 from projects where id=(select id from doomed)),
 'A03: Kuruculuk devrinden sonra eski kurucu isteginin id ile DELETE yolu projeyi silebildi.');

select lock_delivery_event('10000000-0000-0000-0000-000000000001','audit',true);
select pg_temp.observed(exists(select 1 from claim_delivery_jobs((select id from fixture),1) where kind='submit'),
 'A12: Teslim kapandiktan sonra kabul edilemeyecek submit isi worker tarafindan yine alindi.');
update events set voting='acik' where id='10000000-0000-0000-0000-000000000001';
insert into votes(event_id,user_id,project_id,github_login)
select '10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',id,'visitor' from fixture;
select pg_temp.observed(exists(select 1 from votes v join projects p on p.id=v.project_id where p.archive_sha256 is null),
 'A07: Muhur arsivi tamamlanmamis projeye oy kabul edildi.');
rollback;
