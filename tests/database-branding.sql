-- Plan 5 · 0019: topluluk markası, etkinlik rengi/özellikleri ve kilitte donan görünüm. 0018 sonrası çalışır; geri alınır.
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

-- 2 B sahibi, 3 DEÜ organizatörü, 4 B organizatörü, 5 yabancı.
insert into auth.users(id) select ('19000000-0000-0000-0000-00000000000'||n)::uuid from generate_series(2,5) n;
insert into communities(id,slug,name,status) values('19000000-0000-0000-0000-000000000101','plan5-b','Plan 5 B','onaylandi');
insert into community_members(community_id,user_id,github_login,role) values
 ('19000000-0000-0000-0000-000000000101','19000000-0000-0000-0000-000000000002','bsahip','owner'),
 ('19000000-0000-0000-0000-000000000101','19000000-0000-0000-0000-000000000004','borg','organizator'),
 ((select id from communities where slug='deu-csai'),'19000000-0000-0000-0000-000000000003','deuorg','organizator');
create temp table mdocs as select array_agg(document_id) ids from policy_requirements where kind in ('platform','data_processing');
select accept_management_policies('19000000-0000-0000-0000-000000000002','bsahip','19000000-0000-0000-0000-000000000101',(select ids from mdocs));
select accept_management_policies('19000000-0000-0000-0000-000000000004','borg','19000000-0000-0000-0000-000000000101',(select ids from mdocs));
select accept_management_policies('19000000-0000-0000-0000-000000000003','deuorg',(select id from communities where slug='deu-csai'),(select ids from mdocs));

-- Renk -------------------------------------------------------------------------------------------
select pg_temp.assert_true(brand_color_readable('#4a36cf'),'Platform indigo açık temada okunur');
select pg_temp.assert_true(brand_color_readable('#666666'),'Koyu gri okunur');
select pg_temp.assert_true(not brand_color_readable('#777777'),'4.5:1 altı gri reddedilir');
select pg_temp.assert_true(not brand_color_readable('#ffff00'),'Sarı açık temada okunmaz');
select pg_temp.assert_true(not brand_color_readable('#4A36CF') and not brand_color_readable('red') and not brand_color_readable('url(x)'),'Yalnız küçük harfli #rrggbb kabul edilir');

-- Varsayılan özellikler gerçek topluluktan --------------------------------------------------------
create temp table ev as select admin_create_event('19000000-0000-0000-0000-000000000101','Plan 5 B Etkinliği','plan5-b-ev',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days','19000000-0000-0000-0000-000000000002','bsahip') id;
insert into events(id,community_id,slug,title,starts_at,deadline) values
 ('19000000-0000-0000-0000-000000000201',(select id from communities where slug='deu-csai'),'plan5-deu','Plan 5 DEÜ',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days'),
 ('19000000-0000-0000-0000-000000000202','19000000-0000-0000-0000-000000000101','plan5-b-basladi','Başlamış B',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day');
select pg_temp.assert_true((select features='{"public_voting":false,"mystery_hunt":false,"easter_eggs":false,"mascot_naming":false}'::jsonb from events where id=(select id from ev)),'Başka toplulukta özellikler kapalı başlar');
select pg_temp.assert_true((select features='{"public_voting":true,"mystery_hunt":true,"easter_eggs":true,"mascot_naming":true}'::jsonb from events where id='19000000-0000-0000-0000-000000000201'),'DEÜ etkinliğinde geçmiş davranış açık');
select pg_temp.assert_true(not exists(select 1 from events where id in (select id from ev) and accent_color is not null),'Yeni etkinlik platform rengiyle başlar');

-- Doğrudan yazma ve kapalı özellik ----------------------------------------------------------------
select pg_temp.expect_error(format($$update events set features='{"public_voting":true,"mystery_hunt":true,"easter_eggs":true,"mascot_naming":false}' where id=%L$$,(select id from ev)),'OZELLIK','Özellikler doğrudan güncellenemez');
select pg_temp.expect_error(format($$update events set accent_color='#4a36cf' where id=%L$$,(select id from ev)),'OZELLIK','Renk doğrudan güncellenemez');
select pg_temp.expect_error(format($$insert into votes(event_id,user_id,project_id,github_login) values(%L,'19000000-0000-0000-0000-000000000005',gen_random_uuid(),'x')$$,(select id from ev)),'Halk oylaması bu etkinlikte kapalı','Kapalı halk oylamasına doğrudan oy yazılamaz');
select pg_temp.expect_error(format($$insert into mystery_hunters(event_id,user_id,github_login) values(%L,'19000000-0000-0000-0000-000000000005','x')$$,(select id from ev)),'Gizem avı bu etkinlikte kapalı','Kapalı gizeme doğrudan kayıt yazılamaz');
select pg_temp.expect_error(format($$insert into mascot_name_proposals(event_id,author_id,author_login,name) values(%L,'19000000-0000-0000-0000-000000000005','x','Deneme')$$,(select id from ev)),'Maskot isimlendirme bu etkinlikte kapalı','Başka toplulukta maskot önerisi yazılamaz');
select pg_temp.expect_error(format($$update mascot_naming_rounds set phase='oylama' where event_id=%L$$,(select id from ev)),'Maskot isimlendirme bu etkinlikte kapalı','Başka toplulukta maskot aşaması ilerletilemez');

-- Sunum RPC'si ------------------------------------------------------------------------------------
create temp table f_all as select '{"public_voting":true,"mystery_hunt":true,"easter_eggs":true,"mascot_naming":false}'::jsonb f;
select pg_temp.expect_error(format($$select update_event_presentation('19000000-0000-0000-0000-000000000005','x',%L,null,%L)$$,(select id from ev),(select f from f_all)),'YETKI','Yabancı sunumu değiştiremez');
select pg_temp.expect_error(format($$select update_event_presentation('19000000-0000-0000-0000-000000000003','x',%L,null,%L)$$,(select id from ev),(select f from f_all)),'YETKI','Başka topluluğun organizatörü değiştiremez');
select pg_temp.expect_error(format($$select update_event_presentation('19000000-0000-0000-0000-000000000002','x',%L,null,'{"public_voting":true,"mystery_hunt":true,"easter_eggs":true,"mascot_naming":true}')$$,(select id from ev)),'yalnız DEÜ','Maskot bayrağı başka toplulukta açılamaz');
select pg_temp.expect_error(format($$select update_event_presentation('19000000-0000-0000-0000-000000000002','x',%L,null,'{"public_voting":true,"extra":true}')$$,(select id from ev)),'geçersiz','İzinsiz özellik anahtarı reddedilir');
select pg_temp.expect_error(format($$select update_event_presentation('19000000-0000-0000-0000-000000000002','x',%L,null,'{"public_voting":"evet","mystery_hunt":true,"easter_eggs":true,"mascot_naming":false}')$$,(select id from ev)),'geçersiz','Boolean olmayan değer reddedilir');
select pg_temp.expect_error(format($$select update_event_presentation('19000000-0000-0000-0000-000000000002','x',%L,'#ffff00',%L)$$,(select id from ev),(select f from f_all)),'okunabilir değil','Okunamayan renk kaydedilmez');
select pg_temp.expect_error(format($$select update_event_presentation('19000000-0000-0000-0000-000000000002','x',%L,'blue; background:url(x)',%L)$$,(select id from ev),(select f from f_all)),'#RRGGBB','CSS değeri renk olarak kabul edilmez');
select update_event_presentation('19000000-0000-0000-0000-000000000004','borg',(select id from ev),' #0F766E ',(select f from f_all));
select pg_temp.assert_true((select accent_color='#0f766e' and features=(select f from f_all) and presentation_updated_at is not null from events where id=(select id from ev)),'Organizatör renk ve özellikleri kaydeder; renk normalize edilir');
select pg_temp.assert_true(exists(select 1 from admin_audit where action='event_presentation_updated' and event_id=(select id from ev) and actor_id='19000000-0000-0000-0000-000000000004' and after->>'accent_color'='#0f766e'),'Sunum değişikliği aktörle denetim kaydına yazılır');
select pg_temp.assert_true((select accent_color is null from events where id='19000000-0000-0000-0000-000000000201'),'Bir etkinliğin rengi diğerine yayılmaz');

-- Başladıktan sonra özellik değişmez, renk değişebilir (kilide kadar).
select pg_temp.expect_error($$select update_event_presentation('19000000-0000-0000-0000-000000000002','x','19000000-0000-0000-0000-000000000202',null,'{"public_voting":true,"mystery_hunt":false,"easter_eggs":false,"mascot_naming":false}')$$,'başladıktan sonra','Başlamış etkinlikte özellik değişmez');
select update_event_presentation('19000000-0000-0000-0000-000000000002','x','19000000-0000-0000-0000-000000000202','#0f766e','{"public_voting":false,"mystery_hunt":false,"easter_eggs":false,"mascot_naming":false}');
select pg_temp.assert_true((select accent_color='#0f766e' from events where id='19000000-0000-0000-0000-000000000202'),'Başlamış etkinlikte renk değişebilir');

-- Kayıt oluşmuş özellik kapatılarak gizlenemez.
insert into mystery_hunters(event_id,user_id,github_login) values('19000000-0000-0000-0000-000000000201','19000000-0000-0000-0000-000000000005','avci');
select pg_temp.expect_error($$select update_event_presentation('19000000-0000-0000-0000-000000000003','deuorg','19000000-0000-0000-0000-000000000201',null,'{"public_voting":true,"mystery_hunt":false,"easter_eggs":true,"mascot_naming":true}')$$,'kapatılamaz','Gizem çözülmüş etkinlikte gizem avı kapatılamaz');
select update_event_presentation('19000000-0000-0000-0000-000000000003','deuorg','19000000-0000-0000-0000-000000000201',null,'{"public_voting":true,"mystery_hunt":true,"easter_eggs":false,"mascot_naming":true}');
select pg_temp.assert_true((select not (features->>'easter_eggs')::boolean from events where id='19000000-0000-0000-0000-000000000201'),'Kaydı olmayan özellik kapatılabilir');

-- Topluluk markası --------------------------------------------------------------------------------
select pg_temp.expect_error($$select update_community_branding('19000000-0000-0000-0000-000000000004','borg','19000000-0000-0000-0000-000000000101','{"name":"Yeni Ad"}')$$,'YETKI','Organizatör topluluk markasını değiştiremez');
select pg_temp.expect_error($$select update_community_branding('19000000-0000-0000-0000-000000000002','x','19000000-0000-0000-0000-000000000101','{"status":"onaylandi"}')$$,'değiştirilemez','Durum alanı marka formundan değişmez');
select pg_temp.expect_error($$select update_community_branding('19000000-0000-0000-0000-000000000002','x','19000000-0000-0000-0000-000000000101','{"contact_email":"a@b.c"}')$$,'değiştirilemez','İletişim alanı marka formundan değişmez');
select pg_temp.expect_error($$select update_community_branding('19000000-0000-0000-0000-000000000002','x','19000000-0000-0000-0000-000000000101','{"logo_path":"topluluk/00000000-0000-0000-0000-000000000000/aaaaaaaaaaaaaaaaaaaaaaaa.webp"}')$$,'geçersiz','Başka topluluğun yoluna logo yazılamaz');
select pg_temp.expect_error($$select update_community_branding('19000000-0000-0000-0000-000000000002','x','19000000-0000-0000-0000-000000000101','{"logo_path":"topluluk/19000000-0000-0000-0000-000000000101/../x.webp"}')$$,'geçersiz','Keyfi logo yolu reddedilir');
select pg_temp.expect_error($$select update_community_branding('19000000-0000-0000-0000-000000000002','x','19000000-0000-0000-0000-000000000101','{"link":"javascript:alert(1)"}')$$,'HTTPS','Güvensiz bağlantı reddedilir');
create temp table r1 as select update_community_branding('19000000-0000-0000-0000-000000000002','bsahip','19000000-0000-0000-0000-000000000101',
 '{"name":"Plan 5 Topluluğu","city":"Ankara","logo_path":"topluluk/19000000-0000-0000-0000-000000000101/aaaaaaaaaaaaaaaaaaaaaaaa.webp"}') r;
select pg_temp.assert_true((select name='Plan 5 Topluluğu' and city='Ankara' and branding_updated_at is not null and status='onaylandi' from communities where id='19000000-0000-0000-0000-000000000101'),'Sahip marka alanlarını günceller; durum korunur');
select pg_temp.assert_true(exists(select 1 from admin_audit where action='community_branding_updated' and actor_id='19000000-0000-0000-0000-000000000002'),'Marka değişikliği denetim kaydına yazılır');

-- Kilit: görünüm donar ----------------------------------------------------------------------------
select lock_delivery_event((select id from ev),'test',true);
select pg_temp.assert_true((select source='lock' and accent_color='#0f766e' and community_name='Plan 5 Topluluğu'
 and community_logo_path='topluluk/19000000-0000-0000-0000-000000000101/aaaaaaaaaaaaaaaaaaaaaaaa.webp' from event_brand_snapshots where event_id=(select id from ev)),'Kilit anında renk/ad/logo snapshot olarak alınır');
select pg_temp.expect_error(format($$select update_event_presentation('19000000-0000-0000-0000-000000000002','x',%L,'#4a36cf',%L)$$,(select id from ev),(select f from f_all)),'LOCKED','Kilit sonrası sunum değişmez');
select pg_temp.expect_error(format($$update event_brand_snapshots set accent_color='#000000' where event_id=%L$$,(select id from ev)),'LOCKED','Snapshot değiştirilemez');
select pg_temp.expect_error(format($$delete from event_brand_snapshots where event_id=%L$$,(select id from ev)),'LOCKED','Snapshot silinemez');
select pg_temp.assert_true(not ensure_event_brand_snapshot((select id from ev)),'İşçi telafisi var olan snapshot''ı yinelemez');
select pg_temp.assert_true(not ensure_event_brand_snapshot('19000000-0000-0000-0000-000000000201'),'Kilitsiz etkinlikte snapshot alınmaz');
select pg_temp.expect_error(format($$select admin_update_event(%L,'19000000-0000-0000-0000-000000000002','x','voting','{"voting":"acik"}')$$,'19000000-0000-0000-0000-000000000202'),'LOCKED','Kilitsiz etkinlikte oylama açılamaz (mevcut kural)');
-- Halk oylaması kapalı kilitli etkinlik
create temp table ev2 as select admin_create_event('19000000-0000-0000-0000-000000000101','Oylamasız','plan5-b-oysuz',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days','19000000-0000-0000-0000-000000000002','bsahip') id;
select lock_delivery_event((select id from ev2),'test',true);
select pg_temp.expect_error(format($$select admin_update_event(%L,'19000000-0000-0000-0000-000000000002','x','voting','{"voting":"acik"}')$$,(select id from ev2)),'Halk oylaması bu etkinlikte kapalı','Halk oylaması kapalı etkinlikte oylama açılamaz');

-- Logo değişince mühürlü görünüm eski logoyu korur; silinecek logo yalnız referanssızsa döner.
create temp table r2 as select update_community_branding('19000000-0000-0000-0000-000000000002','bsahip','19000000-0000-0000-0000-000000000101','{"logo_path":"topluluk/19000000-0000-0000-0000-000000000101/bbbbbbbbbbbbbbbbbbbbbbbb.webp"}') r;
select pg_temp.assert_true((select r->>'previous_logo' is null and (r->>'changed')::boolean from r2),'Mühürlü görünümdeki logo silinmek üzere döndürülmez');
create temp table r3 as select update_community_branding('19000000-0000-0000-0000-000000000002','bsahip','19000000-0000-0000-0000-000000000101','{"logo_path":"topluluk/19000000-0000-0000-0000-000000000101/cccccccccccccccccccccccc.webp"}') r;
select pg_temp.assert_true((select r->>'previous_logo'='topluluk/19000000-0000-0000-0000-000000000101/bbbbbbbbbbbbbbbbbbbbbbbb.webp' from r3),'Referanssız eski logo temizlik için döner');
select pg_temp.assert_true((select community_logo_path like '%aaaaaaaa%' from event_brand_snapshots where event_id=(select id from ev)),'Topluluk logosu değişse de mühürlü sergi eski logoyu gösterir');
select pg_temp.assert_true((select (r->>'changed')::boolean is false from (select update_community_branding('19000000-0000-0000-0000-000000000002','bsahip','19000000-0000-0000-0000-000000000101','{"name":"Plan 5 Topluluğu"}') r) x),'Değişmeyen marka yeniden yazılmaz');

-- Geçmiş kilitli etkinlikler legacy snapshot alır; kilitli hiçbir etkinlik snapshot'sız kalmaz.
select pg_temp.assert_true(not exists(select 1 from events e where e.locked_at is not null and not exists(select 1 from event_brand_snapshots s where s.event_id=e.id)),'Kalıcı kilitli her etkinliğin görünüm snapshot''ı var');
select pg_temp.assert_true(not exists(select 1 from event_brand_snapshots where source='legacy' and community_logo_path is not null),'Legacy snapshot logo uydurmaz');
-- Hash/SHA alanları marka tablosunda yok.
select pg_temp.assert_true(not exists(select 1 from information_schema.columns where table_name='event_brand_snapshots' and column_name ~ 'sha|hash|archive'),'Marka snapshot''ı teslim kanıtı alanı taşımaz');
-- Erişim
select pg_temp.assert_true(not has_table_privilege('anon','event_brand_snapshots','select') and not has_table_privilege('authenticated','event_brand_snapshots','select'),'Snapshot istemcilere kapalı');
select pg_temp.assert_true(not has_function_privilege('authenticated','update_event_presentation(uuid,text,uuid,text,jsonb)','execute')
 and not has_function_privilege('anon','update_community_branding(uuid,text,uuid,jsonb)','execute'),'Sunum RPC''leri istemcilere kapalı');
rollback;
