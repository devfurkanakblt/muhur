-- 0005 denetim düzeltmeleri. scripts/test-db.mjs'nin ayrı veritabanında çalışır, sonunda geri alınır.
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
  ('30000000-0000-0000-0000-000000000001'), ('30000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000003'), ('30000000-0000-0000-0000-000000000004');
update public.events set is_current = false where is_current;
insert into public.events(id, slug, title, starts_at, deadline, is_current)
values ('40000000-0000-0000-0000-000000000001', 'hardening', 'Sertleştirme', clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour', true);
-- 0012: yönetim RPC'leri etkinliğin topluluğundaki organizatöre, anonimleştirme head admin'e açık.
insert into auth.users(id) values ('30000000-0000-0000-0000-000000000005');
update public.events set community_id = (select id from communities where slug = 'deu-csai') where id = '40000000-0000-0000-0000-000000000001';
insert into public.community_members(community_id, user_id, github_login, role) select id, '30000000-0000-0000-0000-000000000005', 'admin', 'organizator' from communities where slug = 'deu-csai';
insert into public.platform_roles(user_id, login, role) values ('30000000-0000-0000-0000-000000000005', 'admin', 'head_admin');

create temp table h as select id from public.register_project(
  '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  'kurucu', null, 'Sağlam Proje', 'Sağlam Ekip', 'Sertleştirme testi için proje.', 501, 'kurucu/repo', 'https://github.com/kurucu/repo', 'main', null, repeat('a', 40)
);

-- A03/A04 · ekip --------------------------------------------------------------------------
select pg_temp.expect_error($c$ select public.join_project_by_code('zzzz', '30000000-0000-0000-0000-000000000002', 'uye', null) $c$, 'Davet', 'Biçimsiz davet kodu reddedildi');
select public.join_project_by_code((select invite_code from projects where id = (select id from h)), '30000000-0000-0000-0000-000000000002', 'uye', null);
select pg_temp.assert_true((select count(*) = 2 from project_members where project_id = (select id from h)), 'Geçerli davet koduyla katılım');
select pg_temp.expect_error(format('select public.join_project_by_code(%L, %L, ''uye'', null)', (select invite_code from projects where id = (select id from h)), '30000000-0000-0000-0000-000000000002'), 'MEMBER', 'Aynı kişi ikinci kez katılamaz');

create temp table old_code as select invite_code from projects where id = (select id from h);
select pg_temp.expect_error(format('select public.renew_invite(%L, %L, %L)', (select id from h), '30000000-0000-0000-0000-000000000002', repeat('b', 18)), 'kurucu', 'Üye daveti yenileyemez');
select public.renew_invite((select id from h), '30000000-0000-0000-0000-000000000001', repeat('c', 18));
select pg_temp.expect_error(format('select public.join_project_by_code(%L, %L, ''gec'', null)', (select invite_code from old_code), '30000000-0000-0000-0000-000000000003'), 'Davet', 'Yenilenen eski kodla katılım reddedildi');

select pg_temp.expect_error(format('select public.update_project(%L, %L, ''X Proje'', ''Ekip'', ''Yetkisiz kişinin güncellemesi.'', null)', (select id from h), '30000000-0000-0000-0000-000000000003'), 'ekibinde değilsin', 'Ekip dışı kişi projeyi güncelleyemez');
select pg_temp.assert_true(public.update_project((select id from h), '30000000-0000-0000-0000-000000000002', 'Sağlam Proje', 'Sağlam Ekip', 'Üye tarafından yapılan güncelleme.', null, '00/yeni.webp', true) is null, 'Üye günceller; önceki logo yoksa silinecek yol dönmez');
select pg_temp.assert_true(public.update_project((select id from h), '30000000-0000-0000-0000-000000000002', 'Sağlam Proje', 'Sağlam Ekip', 'Üye tarafından yapılan güncelleme.', null, '00/ikinci.webp', true) = '00/yeni.webp', 'Logo değişiminde eski logo yolu silinmek üzere döner');
select pg_temp.assert_true((select actor_id = '30000000-0000-0000-0000-000000000002' from project_timeline where project_id = (select id from h) and kind = 'updated' limit 1), 'Zaman çizelgesi aktörü kaydediyor');

-- Kuruculuk devredildikten sonra eski kurucu geri çekemez, üye çıkaramaz.
select public.transfer_project_owner((select id from h), '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');
select pg_temp.expect_error(format('select public.withdraw_project(%L, %L, ''Sağlam Proje'')', (select id from h), '30000000-0000-0000-0000-000000000001'), 'yalnızca kurucu', 'Eski kurucu devirden sonra projeyi silemez');
select pg_temp.expect_error(format('select public.remove_member(%L, %L, %L)', (select id from h), '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'), 'yalnızca kurucu', 'Eski kurucu devirden sonra üye çıkaramaz');
select pg_temp.expect_error(format('select public.withdraw_project(%L, %L, ''yanlış ad'')', (select id from h), '30000000-0000-0000-0000-000000000002'), 'aynen yaz', 'Geri çekme onayı DB tarafında denetlenir');
select pg_temp.assert_true(public.remove_member((select id from h), '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001'), 'Yeni kurucu üyeyi çıkarır');
select pg_temp.assert_true(not public.leave_project('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'), 'Kurucu ayrılma yoluyla projeyi sahipsiz bırakamaz');

-- A05/A08 · teslim isteği -------------------------------------------------------------------
create temp table first_job as select * from public.claim_delivery_jobs((select id from h), 1);
select pg_temp.assert_true(
  (public.enqueue_submission((select id from h), '30000000-0000-0000-0000-000000000002', repeat('d', 40), 'main', 'kurucu/repo')->>'status') = 'busy',
  'Önceki sürüm işlenirken yeni SHA açıkça reddedilir (busy)');
select pg_temp.assert_true(
  (public.enqueue_submission((select id from h), '30000000-0000-0000-0000-000000000002', repeat('a', 40), 'main', 'kurucu/repo')->>'status') = 'queued',
  'Aynı SHA zaten sıradaysa mevcut iş döner (queued)');
select pg_temp.assert_true(
  (public.enqueue_submission((select id from h), '30000000-0000-0000-0000-000000000002', repeat('d', 40), 'main', 'kurucu/repo')->>'queuedSha') = repeat('a', 40),
  'Yanıt sıradaki SHA''yı istenen SHA''dan ayırır');
select public.complete_submission((select id from first_job), (select lease_token from first_job), 'teslim/' || (select id::text from first_job) || '.zip', repeat('1', 64), 100);
select pg_temp.assert_true(
  (public.enqueue_submission((select id from h), '30000000-0000-0000-0000-000000000002', repeat('a', 40), 'main', 'kurucu/repo')->>'status') = 'already_accepted',
  'Kabul edilmiş SHA yeniden arşivlenmez');
select pg_temp.assert_true((select count(*) = 1 from delivery_jobs where project_id = (select id from h) and kind = 'submit'), 'Tekrarlanan istekler yeni iş oluşturmadı');

-- Kota: aynı proje 10 dakikada en fazla 6 yeni teslim işi açar.
do $$
declare i integer; j delivery_jobs; pid uuid := (select id from h);
begin
  for i in 1..5 loop
    perform public.enqueue_submission(pid, '30000000-0000-0000-0000-000000000002', repeat(i::text, 40), 'main', 'kurucu/repo');
    select * into j from public.claim_delivery_jobs(pid, 1);
    perform public.complete_submission(j.id, j.lease_token, 'teslim/' || j.id::text || '.zip', repeat(i::text, 64), 100);
  end loop;
end $$;
select pg_temp.assert_true(
  (public.enqueue_submission((select id from h), '30000000-0000-0000-0000-000000000002', repeat('e', 40), 'main', 'kurucu/repo')->>'status') = 'rate_limited',
  'Yedinci teslim isteği hız sınırına takıldı');

-- Budama: güncel kabul + en yeni üç eski arşiv kalır, kayıtlar kanıt olarak durur.
create temp table pruned as select * from public.prune_submission_archives((select id from h), 3);
select pg_temp.assert_true((select count(*) = 2 from pruned), 'Altı kabulden en eski ikisinin dosyası budanacak');
select pg_temp.assert_true((select count(*) = 6 from submissions where project_id = (select id from h)), 'Budanan kabul kayıtları silinmedi');
select pg_temp.assert_true(not exists(select 1 from pruned join projects p on p.accepted_archive_path = pruned.prune_submission_archives), 'Güncel kabul arşivi budanmadı');
select pg_temp.expect_error(format('update submissions set archive_pruned_at = clock_timestamp() where archive_path = %L', (select accepted_archive_path from projects where id = (select id from h))), 'LOCKED', 'Güncel kabul arşivi elle budanamaz');
select pg_temp.expect_error(format('update submissions set sha = repeat(''f'',40) where project_id = %L', (select id from h)), 'LOCKED', 'Kabul kaydının içeriği değiştirilemez');

-- A22 · İş durumu: silinmiş iş depoya yazmaz.
select pg_temp.assert_true(public.delivery_job_state(gen_random_uuid(), gen_random_uuid()) = 'gone', 'Var olmayan iş yazma izni almaz');
select pg_temp.assert_true(not public.complete_submission(gen_random_uuid(), gen_random_uuid(), 'teslim/x.zip', repeat('1', 64), 1), 'Silinmiş iş için kabul hata atmadan reddedilir');
select pg_temp.assert_true(not public.fail_delivery_job(gen_random_uuid(), gen_random_uuid(), 'yok', true), 'Silinmiş iş için hata kaydı hata atmaz');

-- A12 · Kilitten sonra bekleyen teslim işi indirilmeden kapanır; mühür işi alınır.
create temp table h2 as select id from public.register_project(
  '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003',
  'ikinci', null, 'İkinci Proje', 'İkinci Ekip', 'Kilit sonrası kuyruk testi.', 502, 'ikinci/repo', 'https://github.com/ikinci/repo', 'main', null, repeat('b', 40)
);
select public.lock_delivery_event('40000000-0000-0000-0000-000000000001', 'test', true);
select public.enqueue_seals('40000000-0000-0000-0000-000000000001');
create temp table after_lock as select * from public.claim_delivery_jobs(null, 8);
select pg_temp.assert_true(not exists(select 1 from after_lock where kind = 'submit'), 'Kilitli etkinliğin teslim işi kuyruktan alınmadı');
select pg_temp.assert_true(exists(select 1 from after_lock where kind = 'seal'), 'Mühür işleri alındı');
select pg_temp.assert_true((select state = 'failed' and error like 'Teslim süresi doldu%' from delivery_jobs where project_id = (select id from h2) and kind = 'submit'), 'Geç teslim işi terminal duruma geçti');
select pg_temp.assert_true((select delivery_error is not null from projects where id = (select id from h2)), 'Geç teslim ekibe hata olarak yansıdı');
select public.complete_seal(id, lease_token) from after_lock where project_id = (select id from h);
select pg_temp.assert_true((select archive_sha256 is not null from projects where id = (select id from h)), 'Kabul edilmiş proje mühürlendi');
select pg_temp.expect_error(format('update submissions set archive_pruned_at = clock_timestamp() where project_id = %L and archive_pruned_at is null', (select id from h)), 'LOCKED', 'Kilitten sonra arşiv budanamaz');
select pg_temp.assert_true((select count(*) = 0 from public.prune_submission_archives((select id from h), 0)), 'Kilitten sonra budama RPC''si boş döner');

-- A06/A07/A17 · oylama --------------------------------------------------------------------
select public.admin_update_event('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', 'admin', 'voting', '{"voting":"acik"}');
select pg_temp.expect_error(format('insert into votes(event_id,user_id,project_id,github_login) values(%L,%L,%L,''z'')', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', (select id from h2)), 'mühürlü', 'Mühürsüz esere oy verilemez');
insert into votes(event_id,user_id,project_id,github_login) values('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', (select id from h), 'ziyaretci');
select pg_temp.assert_true(public.vote_tallies('40000000-0000-0000-0000-000000000001') = '{}'::jsonb, 'Sonuçlanmadan toplamlar açılmaz');
select public.admin_update_event('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', 'admin', 'voting', '{"voting":"sonuclandi"}');
select pg_temp.assert_true((public.vote_tallies('40000000-0000-0000-0000-000000000001')->>(select id::text from h))::int = 1, 'Toplamlar DB''de sayıldı');
select pg_temp.assert_true((select count(*) = 2 from admin_audit where event_id = '40000000-0000-0000-0000-000000000001' and action = 'voting'), 'Oylama değişiklikleri aktörle kaydedildi');
select pg_temp.assert_true((select after->>'voting' = 'sonuclandi' and before->>'voting' = 'acik' from admin_audit where action = 'voting' order by occurred_at desc limit 1), 'Denetim kaydı önce/sonra değerini tutar');
select pg_temp.expect_error('update admin_audit set actor_login = ''x''', 'değiştirilemez', 'Denetim kaydı değiştirilemez');
select pg_temp.expect_error('delete from admin_audit', 'değiştirilemez', 'Denetim kaydı silinemez');
select pg_temp.expect_error($c$ select public.admin_update_event('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', 'admin', 'x', '{"locked_at":null}') $c$, 'Geçersiz', 'Yönetim RPC''si yalnızca izinli alanları değiştirir');

-- A19 · anonimleştirme: kilit sonrası yalnızca ad/avatar değişir, mühür korunur.
select pg_temp.expect_error($c$ select public.anonymize_user('30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000005', 'admin', '') $c$, 'gerekçe', 'Gerekçesiz anonimleştirme reddedildi');
select pg_temp.assert_true(public.anonymize_user('30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000005', 'admin', 'KVKK silme başvurusu') = 1, 'Kilitli etkinlikte üyelik anonimleştirildi');
select pg_temp.assert_true((select github_login like 'anonim-%' and avatar_url is null from project_members where user_id = '30000000-0000-0000-0000-000000000002'), 'Kullanıcı adı ve avatar kaldırıldı');
select pg_temp.assert_true((select archive_sha256 is not null and frozen_sha = repeat('5', 40) from projects where id = (select id from h)), 'Mühür ve commit korunuyor');
select pg_temp.expect_error(format('update project_members set role = ''owner'' where user_id = %L', '30000000-0000-0000-0000-000000000003'), 'LOCKED', 'Kilit sonrası anonimleştirme dışında ekip değişmez');
select set_config('muhur.anonymize', 'on', true);
select pg_temp.expect_error('update project_members set role = ''member'' where user_id = ''30000000-0000-0000-0000-000000000002''', 'LOCKED', 'Anonimleştirme bayrağı rol değişikliğine izin vermez');
select pg_temp.expect_error(format('update votes set project_id = %L where user_id = %L', (select id from h2), '30000000-0000-0000-0000-000000000004'), 'Oylama açık değil', 'Anonimleştirme bayrağı oy değiştirmeye izin vermez');
select set_config('muhur.anonymize', 'off', true);

-- Kira -----------------------------------------------------------------------------------
select pg_temp.assert_true(public.try_worker_lease('test-lease', 60), 'İlk çağrı kirayı alır');
select pg_temp.assert_true(not public.try_worker_lease('test-lease', 60), 'Kira dolmadan ikinci çağrı alamaz');
select pg_temp.assert_true(public.try_worker_lease('istek:duyuru:abc', 60) and not public.try_worker_lease('istek:duyuru:abc', 60), 'Aynı istek anahtarı pencere içinde bir kez işlenir');
delete from worker_leases where name = 'istek:duyuru:abc';
select pg_temp.assert_true(public.try_worker_lease('istek:duyuru:abc', 60), 'Başarısız işlemden sonra bırakılan anahtar yeniden alınabilir');

select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.anonymize_user(uuid,uuid,text,text)', 'EXECUTE'), 'Kullanıcı anonimleştirme RPC''sini çağıramaz');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.join_project_by_code(text,uuid,text,text)', 'EXECUTE'), 'Anon doğrudan katılım RPC''sini çağıramaz');
select pg_temp.assert_true(has_function_privilege('service_role', 'public.vote_tallies(uuid)', 'EXECUTE'), 'Sunucu rolü toplamları okuyabilir');
rollback;
