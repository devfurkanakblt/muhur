-- 0013 etkinlik oluşturma ve is_current'tan bağımsız katılım. scripts/test-db.mjs'nin ayrı veritabanında çalışır, sonunda geri alınır.
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

-- Kurulum ---------------------------------------------------------------------------------------
-- Kullanıcılar: 70..01 DEÜ sahibi, 70..02 B organizatörü, 70..03 katılımcı, 70..04 ikinci katılımcı, 70..05 üye olmayan head admin.
insert into auth.users(id) values
  ('70000000-0000-0000-0000-000000000001'), ('70000000-0000-0000-0000-000000000002'),
  ('70000000-0000-0000-0000-000000000003'), ('70000000-0000-0000-0000-000000000004'),
  ('70000000-0000-0000-0000-000000000005');
update public.events set is_current = false where is_current;
insert into public.communities(slug, name, status) values ('test-b', 'Test B Topluluğu', 'onaylandi');
insert into public.community_members(community_id, user_id, github_login, role) values
  ((select id from communities where slug = 'deu-csai'), '70000000-0000-0000-0000-000000000001', 'deu-sahip', 'owner'),
  ((select id from communities where slug = 'test-b'), '70000000-0000-0000-0000-000000000002', 'b-org', 'organizator');
insert into public.platform_roles(user_id, login, role) values ('70000000-0000-0000-0000-000000000005', 'head', 'head_admin');

-- Oluşturma: iki etkinlik aynı anda açık ------------------------------------------------------
create temp table t_ev as
select
  public.admin_create_event((select id from communities where slug = 'deu-csai'), 'Birinci Etkinlik', 'etkinlik-bir',
    clock_timestamp() - interval '1 hour', clock_timestamp() + interval '2 hours',
    '70000000-0000-0000-0000-000000000001', 'deu-sahip') as a,
  public.admin_create_event((select id from communities where slug = 'deu-csai'), 'İkinci Etkinlik', 'etkinlik-iki',
    clock_timestamp() - interval '1 hour', clock_timestamp() + interval '2 hours',
    '70000000-0000-0000-0000-000000000001', 'deu-sahip') as b;
select pg_temp.assert_true((select a is not null and b is not null and a <> b from t_ev), 'Sahip aynı toplulukta iki etkinlik oluşturur');
select pg_temp.assert_true((select count(*) = 2 and bool_and(not is_current) and bool_and(locked_at is null) and bool_and(community_id = (select id from communities where slug = 'deu-csai'))
  from events where id in (select a from t_ev union select b from t_ev)), 'İki etkinlik kilitsiz, güncel değil ve topluluğa bağlı');
select pg_temp.assert_true((select count(*) = 2 from admin_audit where action = 'event_created' and event_id in (select a from t_ev union select b from t_ev)), 'Her oluşturma denetim kaydı yazar');
select pg_temp.assert_true((select after->>'slug' = 'etkinlik-bir' and after ? 'community' from admin_audit where action = 'event_created' and event_id = (select a from t_ev)), 'Denetim kaydı etkinlik bilgisini taşır');

-- Katılım güncel etkinliğe bağlı değil ----------------------------------------------------------
select pg_temp.assert_true((select not is_current from events where id = (select b from t_ev)), 'İkinci etkinlik güncel değil');
create temp table t_proj as
select * from public.register_project((select b from t_ev), '70000000-0000-0000-0000-000000000003', 'katilimci', null,
  'Proje Bir', 'Ekip Bir', 'Güncel olmayan etkinliğe kayıt.', 7001, 'k/r', 'https://github.com/k/r', 'main', null, null);
select pg_temp.assert_true((select event_id = (select b from t_ev) from t_proj), 'Güncel olmayan etkinliğe kayıt, projeye o etkinliğin kimliğini verir');
select pg_temp.assert_true((select public.join_project_by_code((select invite_code from projects where id = (select id from t_proj)),
  '70000000-0000-0000-0000-000000000004', 'ikinci', null)) = (select id from t_proj), 'Davet koduyla güncel olmayan etkinlikte ekibe katılınır');
select pg_temp.assert_true((select count(*) = 2 from project_members where project_id = (select id from t_proj)), 'Ekip iki üyeli');

-- Yetki -----------------------------------------------------------------------------------------
select pg_temp.expect_error(format('select public.admin_create_event(%L, ''Yetkisiz'', ''yetkisiz-bir'', clock_timestamp(), clock_timestamp() + interval ''1 day'', %L, ''b-org'')',
  (select id from communities where slug = 'deu-csai'), '70000000-0000-0000-0000-000000000002'), 'YETKI', 'Başka topluluğun organizatörü etkinlik oluşturamaz');
select pg_temp.expect_error(format('select public.admin_create_event(%L, ''Yetkisiz'', ''yetkisiz-iki'', clock_timestamp(), clock_timestamp() + interval ''1 day'', %L, ''head'')',
  (select id from communities where slug = 'deu-csai'), '70000000-0000-0000-0000-000000000005'), 'YETKI', 'Üye olmayan head admin etkinlik oluşturamaz');
select pg_temp.expect_error(format('select public.admin_create_event(%L, ''Yetkisiz'', ''yetkisiz-uc'', clock_timestamp(), clock_timestamp() + interval ''1 day'', %L, ''x'')',
  gen_random_uuid(), '70000000-0000-0000-0000-000000000001'), 'YETKI', 'Olmayan topluluk YETKI ile reddedilir');
select pg_temp.assert_true((select public.admin_create_event((select id from communities where slug = 'test-b'), 'B Etkinliği', 'b-etkinlik-bir',
  clock_timestamp(), clock_timestamp() + interval '1 day', '70000000-0000-0000-0000-000000000002', 'b-org')) is not null, 'B organizatörü kendi topluluğunda etkinlik oluşturur');
select pg_temp.assert_true((select count(*) = 3 from admin_audit where action = 'event_created'), 'Başarılı her oluşturma denetim kaydı yazar (üç kayıt)');

-- Topluluk durumu -------------------------------------------------------------------------------
update communities set status = 'askida' where slug = 'test-b';
select pg_temp.expect_error(format('select public.admin_create_event(%L, ''Askıda'', ''askida-bir'', clock_timestamp(), clock_timestamp() + interval ''1 day'', %L, ''b-org'')',
  (select id from communities where slug = 'test-b'), '70000000-0000-0000-0000-000000000002'), 'ASKIDA', 'Askıdaki toplulukta etkinlik oluşturulamaz');
update communities set status = 'beklemede' where slug = 'test-b';
select pg_temp.expect_error(format('select public.admin_create_event(%L, ''Beklemede'', ''beklemede-bir'', clock_timestamp(), clock_timestamp() + interval ''1 day'', %L, ''b-org'')',
  (select id from communities where slug = 'test-b'), '70000000-0000-0000-0000-000000000002'), 'YETKI', 'Beklemedeki toplulukta etkinlik oluşturulamaz');
update communities set status = 'onaylandi' where slug = 'test-b';

-- Doğrulama -------------------------------------------------------------------------------------
select pg_temp.expect_error(format('select public.admin_create_event(%L, ''Aynı Slug'', ''etkinlik-bir'', clock_timestamp(), clock_timestamp() + interval ''1 day'', %L, ''deu-sahip'')',
  (select id from communities where slug = 'deu-csai'), '70000000-0000-0000-0000-000000000001'), 'duplicate key', 'Aynı slug ikinci kez kullanılamaz');
select pg_temp.expect_error(format('select public.admin_create_event(%L, ''Geçmiş'', ''gecmis-bir'', clock_timestamp() - interval ''2 days'', clock_timestamp() - interval ''1 day'', %L, ''deu-sahip'')',
  (select id from communities where slug = 'deu-csai'), '70000000-0000-0000-0000-000000000001'), 'Etkinlik bilgileri geçersiz', 'Geçmiş son teslim reddedilir');
select pg_temp.expect_error(format('select public.admin_create_event(%L, ''Ters'', ''ters-bir'', clock_timestamp() + interval ''2 days'', clock_timestamp() + interval ''1 day'', %L, ''deu-sahip'')',
  (select id from communities where slug = 'deu-csai'), '70000000-0000-0000-0000-000000000001'), 'Etkinlik bilgileri geçersiz', 'Başlangıç son tesliminden sonra olamaz');
select pg_temp.expect_error(format('select public.admin_create_event(%L, ''ab'', ''kisa-ad'', clock_timestamp(), clock_timestamp() + interval ''1 day'', %L, ''deu-sahip'')',
  (select id from communities where slug = 'deu-csai'), '70000000-0000-0000-0000-000000000001'), 'Etkinlik bilgileri geçersiz', 'Çok kısa ad reddedilir');
select pg_temp.expect_error(format('select public.admin_create_event(%L, ''Kötü Slug'', ''Kotu Slug'', clock_timestamp(), clock_timestamp() + interval ''1 day'', %L, ''deu-sahip'')',
  (select id from communities where slug = 'deu-csai'), '70000000-0000-0000-0000-000000000001'), 'Etkinlik bilgileri geçersiz', 'Geçersiz slug reddedilir');

-- İzinler ---------------------------------------------------------------------------------------
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.admin_create_event(uuid,text,text,timestamptz,timestamptz,uuid,text)', 'execute'), 'authenticated admin_create_event çalıştıramaz');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.admin_create_event(uuid,text,text,timestamptz,timestamptz,uuid,text)', 'execute'), 'anon admin_create_event çalıştıramaz');
select pg_temp.assert_true(has_function_privilege('service_role', 'public.admin_create_event(uuid,text,text,timestamptz,timestamptz,uuid,text)', 'execute'), 'service_role admin_create_event çalıştırabilir');
select pg_temp.assert_true(not has_function_privilege('service_role', 'public.register_project_v0(uuid,uuid,text,text,text,text,text,bigint,text,text,text,text,text)', 'execute'), 'service_role register_project_v0 çalıştıramaz');
select pg_temp.assert_true(not has_function_privilege('service_role', 'public.join_project_by_code_v0(text,uuid,text,text)', 'execute'), 'service_role join_project_by_code_v0 çalıştıramaz');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.register_project_v0(uuid,uuid,text,text,text,text,text,bigint,text,text,text,text,text)', 'execute'), 'authenticated register_project_v0 çalıştıramaz');
rollback;
