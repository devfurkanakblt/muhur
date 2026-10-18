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

update events set is_current = false where is_current;
insert into events(id, slug, title, starts_at, deadline, locked_at, is_current)
values ('73000000-0000-0000-0000-000000000001', 'activity-test', 'Mola Testi', now() - interval '2 hour', now() - interval '1 hour', now() - interval '1 hour', true);

select public.admin_update_event('73000000-0000-0000-0000-000000000001', null, 'admin', 'activity', '{"activity":{"kind":"yemek","title":"  Öğle yemeği "}}');
select pg_temp.assert_true((select activity_kind = 'yemek' and activity_title = 'Öğle yemeği' and activity_at is not null from events where id = '73000000-0000-0000-0000-000000000001'), 'Yemek saati kilitli etkinlikte de duyurulur');
select public.admin_update_event('73000000-0000-0000-0000-000000000001', null, 'admin', 'activity', '{"activity":{"kind":"oyun","title":"Vampir köylü"}}');
select pg_temp.assert_true((select activity_kind = 'oyun' and activity_title = 'Vampir köylü' from events where id = '73000000-0000-0000-0000-000000000001'), 'Yeni duyuru öncekinin yerine geçer');
select pg_temp.assert_true((select before->>'activity_kind' = 'yemek' and after->>'activity_title' = 'Vampir köylü' from admin_audit where action = 'activity' order by occurred_at desc limit 1), 'Denetim kaydı önce/sonra değerini tutar');
select pg_temp.expect_error($c$ select public.admin_update_event('73000000-0000-0000-0000-000000000001', null, 'admin', 'activity', '{"activity":{"kind":"parti","title":"Parti"}}') $c$, 'activity_kind', 'Bilinmeyen tür reddedilir');
select pg_temp.expect_error($c$ select public.admin_update_event('73000000-0000-0000-0000-000000000001', null, 'admin', 'activity', '{"activity":{"kind":"oyun","title":" "}}') $c$, 'events_activity_complete', 'Adsız etkinlik reddedilir');
select pg_temp.expect_error($c$ select public.admin_update_event('73000000-0000-0000-0000-000000000001', null, 'admin', 'activity', '{"activity":"oyun"}') $c$, 'Geçersiz', 'Nesne olmayan değer reddedilir');
select public.admin_update_event('73000000-0000-0000-0000-000000000001', null, 'admin', 'activity', '{"activity":null}');
select pg_temp.assert_true((select activity_kind is null and activity_title is null and activity_at is null from events where id = '73000000-0000-0000-0000-000000000001'), 'Bitirince alanlar temizlenir');

rollback;
