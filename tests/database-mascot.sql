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
  ('71000000-0000-0000-0000-000000000001'),
  ('71000000-0000-0000-0000-000000000002'),
  ('71000000-0000-0000-0000-000000000003'),
  ('71000000-0000-0000-0000-000000000004');
update events set is_current = false where is_current;
insert into events(id, slug, title, starts_at, deadline, is_current)
values ('72000000-0000-0000-0000-000000000001', 'mascot-test', 'Maskot Testi', now() - interval '1 hour', now() + interval '1 hour', true);
select pg_temp.assert_true((select phase = 'oneriler' from mascot_naming_rounds where event_id = '72000000-0000-0000-0000-000000000001'), 'Yeni etkinliğe öneri turu açılır');

select id from register_project('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001',
  'bir', null, 'Maskot Proje Bir', 'Ekip Bir', 'Birinci test projesi.', 711, 'bir/repo', 'https://github.com/bir/repo', 'main', null, repeat('a', 40));
select id from register_project('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002',
  'iki', null, 'Maskot Proje İki', 'Ekip İki', 'İkinci test projesi.', 712, 'iki/repo', 'https://github.com/iki/repo', 'main', null, repeat('b', 40));
insert into project_members(project_id,event_id,user_id,github_login,role)
select id,event_id,'71000000-0000-0000-0000-000000000004','dort','member' from projects
where event_id='72000000-0000-0000-0000-000000000001' and repo_id=712;

select pg_temp.expect_error($cmd$insert into mascot_name_proposals(event_id,author_id,author_login,name)
  values('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000003','uc','Mırmır')$cmd$,
  'Yalnızca yarışmacılar', 'Ziyaretçi isim öneremez');
insert into mascot_name_proposals(event_id,author_id,author_login,name) values
  ('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','bir','Mırmır'),
  ('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002','iki','Pofuduk');
select pg_temp.expect_error($cmd$insert into mascot_name_proposals(event_id,author_id,author_login,name)
  values('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','bir','Başka')$cmd$,
  'duplicate key', 'Aynı yarışmacı ikinci isim öneremez');
select pg_temp.expect_error($cmd$insert into mascot_name_proposals(event_id,author_id,author_login,name)
  values('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000004','dort','mırmır')$cmd$,
  'duplicate key', 'Aynı isim büyük küçük harf farkıyla tekrar önerilemez');

update mascot_name_proposals set name = 'Mırnav' where author_id = '71000000-0000-0000-0000-000000000001' and event_id = '72000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select name = 'Mırnav' from mascot_name_proposals where author_id = '71000000-0000-0000-0000-000000000001' and event_id = '72000000-0000-0000-0000-000000000001'), 'Öneri aşamasında isim düzenlenir');
select pg_temp.expect_error($cmd$update mascot_name_proposals set name = 'pofuduk'
  where author_id = '71000000-0000-0000-0000-000000000001' and event_id = '72000000-0000-0000-0000-000000000001'$cmd$,
  'duplicate key', 'Düzenlenen isim başka bir öneriyle aynı olamaz');
update mascot_name_proposals set name = 'MIRNAV' where author_id = '71000000-0000-0000-0000-000000000001' and event_id = '72000000-0000-0000-0000-000000000001';
update mascot_name_proposals set name = 'Mırmır' where author_id = '71000000-0000-0000-0000-000000000001' and event_id = '72000000-0000-0000-0000-000000000001';
select pg_temp.expect_error($cmd$update mascot_name_proposals set author_login = 'baskasi'
  where author_id = '71000000-0000-0000-0000-000000000001' and event_id = '72000000-0000-0000-0000-000000000001'$cmd$,
  'Öneri değiştirilemez', 'Düzenleme isim dışındaki alanları değiştiremez');

update mascot_name_proposals set visible = false where name = 'Pofuduk' and event_id = '72000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select count(*) = 1 from mascot_name_tallies('72000000-0000-0000-0000-000000000001')), 'Gizlenen isim canlı listeden çıkar');
select pg_temp.expect_error($cmd$update mascot_name_proposals set name = 'Temiz İsim'
  where name = 'Pofuduk' and event_id = '72000000-0000-0000-0000-000000000001'$cmd$,
  'Yayından kaldırılan', 'Yayından kaldırılan öneri düzenlenemez');
update mascot_name_proposals set visible = true where name = 'Pofuduk' and event_id = '72000000-0000-0000-0000-000000000001';
update mascot_naming_rounds set phase = 'oylama' where event_id = '72000000-0000-0000-0000-000000000001';
select pg_temp.expect_error($cmd$update mascot_name_proposals set name = 'Geç Düzenleme'
  where name = 'Mırmır' and event_id = '72000000-0000-0000-0000-000000000001'$cmd$,
  'Öneri aşaması kapalı', 'Oylama başlayınca isim düzenlenemez');
select pg_temp.expect_error($cmd$insert into mascot_name_proposals(event_id,author_id,author_login,name)
  values('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000004','dort','Yeni İsim')$cmd$,
  'Öneri aşaması kapalı', 'Oylama başlayınca öneri eklenemez');
select pg_temp.expect_error($cmd$insert into mascot_name_votes(event_id,voter_id,voter_login,proposal_id)
  select event_id,author_id,'bir',id from mascot_name_proposals where name='Mırmır' and event_id='72000000-0000-0000-0000-000000000001'$cmd$,
  'Kendi önerine', 'Öneren kendi ismine oy veremez');
insert into mascot_name_votes(event_id,voter_id,voter_login,proposal_id)
select event_id,'71000000-0000-0000-0000-000000000003','uc',id from mascot_name_proposals
where name='Mırmır' and event_id='72000000-0000-0000-0000-000000000001';
select pg_temp.expect_error($cmd$insert into mascot_name_votes(event_id,voter_id,voter_login,proposal_id)
  select event_id,'71000000-0000-0000-0000-000000000003','uc',id from mascot_name_proposals
  where name='Pofuduk' and event_id='72000000-0000-0000-0000-000000000001'$cmd$,
  'duplicate key', 'Bir GitHub hesabı ikinci oy veremez');
select pg_temp.assert_true((select vote_count = 1 from mascot_name_tallies('72000000-0000-0000-0000-000000000001')
  where proposal_id = (select id from mascot_name_proposals where name='Mırmır' and event_id='72000000-0000-0000-0000-000000000001')),
  'Oy sayısı canlı okunur');
update mascot_naming_rounds set phase = 'sonuc' where event_id = '72000000-0000-0000-0000-000000000001';
select pg_temp.expect_error($cmd$insert into mascot_name_votes(event_id,voter_id,voter_login,proposal_id)
  select event_id,'71000000-0000-0000-0000-000000000004','dort',id from mascot_name_proposals
  where name='Pofuduk' and event_id='72000000-0000-0000-0000-000000000001'$cmd$,
  'Oylama açık değil', 'Sonuçtan sonra oy verilemez');
select pg_temp.expect_error($cmd$update mascot_naming_rounds set phase='oneriler' where event_id='72000000-0000-0000-0000-000000000001'$cmd$,
  'Geçersiz aşama', 'Sonuçtan öneriye dönülemez');
insert into public.platform_roles(user_id, login, role) values ('71000000-0000-0000-0000-000000000004', 'dort', 'head_admin'); -- 0012: anonimleştirme head admin'e açık.
select anonymize_user('71000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000004', 'dort', 'Test anonimleştirmesi');
select anonymize_user('71000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-000000000004', 'dort', 'Test anonimleştirmesi');
select pg_temp.assert_true((select author_login like 'anonim-%' from mascot_name_proposals where name='Mırmır' and event_id='72000000-0000-0000-0000-000000000001'), 'Öneren kullanıcı adı sonuç aşamasında anonimleşir');
select pg_temp.assert_true((select voter_login like 'anonim-%' from mascot_name_votes where voter_id='71000000-0000-0000-0000-000000000003'), 'Oy veren kullanıcı adı sonuç aşamasında anonimleşir');

rollback;
