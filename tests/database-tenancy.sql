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

rollback;
