-- 0007 gizem avcıları. scripts/test-db.mjs'nin ayrı veritabanında çalışır, sonunda geri alınır.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.fails(sql text, pattern text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return sqlerrm like pattern; end $$;

insert into auth.users(id) values ('70000000-0000-0000-0000-000000000001'), ('70000000-0000-0000-0000-000000000002');
update public.events set is_current = false where is_current;
insert into public.events(id, slug, title, starts_at, deadline, is_current)
values ('71000000-0000-0000-0000-000000000001', 'gizem', 'Gizem', clock_timestamp() + interval '1 hour', clock_timestamp() + interval '25 hours', true);

select pg_temp.assert_true(pg_temp.fails(
  $q$select public.claim_mystery('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'avci')$q$,
  'MYSTERY: Gizem yalnızca hackathon saatlerinde açık.'), 'Etkinlik başlamadan gizem kaydedilmez');

update events set starts_at = clock_timestamp() - interval '1 hour' where id = '71000000-0000-0000-0000-000000000001';
create temp table first_find as select public.claim_mystery('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'avci') as at;
select pg_temp.assert_true((select at is not null from first_find), 'Hackathon sırasında gizem kaydedilir');
select pg_sleep(0.05);
select pg_temp.assert_true(
  (select public.claim_mystery('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'avci') = (select at from first_find)),
  'İkinci kez yazmak ilk bulma anını değiştirmez');
select pg_temp.assert_true((select count(*) = 1 from mystery_hunters where user_id = '70000000-0000-0000-0000-000000000001'), 'Aynı kişi tek kayıt');

select pg_temp.assert_true(pg_temp.fails(
  $q$select public.claim_mystery('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '  ')$q$,
  'Geçersiz kullanıcı'), 'Boş kullanıcı adıyla kayıt yapılmaz');

select public.anonymize_user('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'yonetici', 'KVKK silme başvurusu');
select pg_temp.assert_true((select github_login like 'anonim-%' from mystery_hunters where user_id = '70000000-0000-0000-0000-000000000001'),
  'Kişisel veri silme gizem kaydındaki adı anonimleştirir');

update events set locked_at = clock_timestamp() where id = '71000000-0000-0000-0000-000000000001';
select pg_temp.assert_true(pg_temp.fails(
  $q$select public.claim_mystery('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'gec')$q$,
  'MYSTERY: Gizem yalnızca hackathon saatlerinde açık.'), 'Mühür vurulduktan sonra gizem kaydedilmez');

select pg_temp.assert_true(not has_table_privilege('anon', 'public.mystery_hunters', 'select')
  and not has_table_privilege('authenticated', 'public.mystery_hunters', 'select')
  and not has_function_privilege('authenticated', 'public.claim_mystery(uuid, uuid, text)', 'execute'),
  'Gizem tablosu ve fonksiyonu yalnızca sunucuya açık');
select pg_temp.assert_true(public.delivery_schema_version() = 7, 'Şema sürümü 7');

rollback;
