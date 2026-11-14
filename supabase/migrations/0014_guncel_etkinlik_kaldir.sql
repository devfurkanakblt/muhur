-- "Güncel etkinlik" kavramının kaldırılması. Yalnızca Plan 2 kodu (is_current okumayan, switch_event çağırmayan)
-- yayına alındıktan sonra uygulanır. Her etkinlik bir topluluğa bağlıdır; birden çok etkinlik aynı anda açık olabilir.
begin;

-- Topluluksuz etkinlik kalmışsa NOT NULL'dan önce açık bir hatayla durulur; sessizce bir topluluğa atanmaz.
do $$
begin
  if exists(select 1 from public.events where community_id is null) then
    raise exception 'Topluluğu olmayan etkinlik var; 0014 uygulanmadan önce community_id doldurulmalı.';
  end if;
end $$;

-- Eski geçiş ailesi: sarmalayıcı (0012), eski gövde (0005 → _v0) ve çekirdek (0004).
drop function public.admin_switch_event(uuid, text, text, timestamptz, timestamptz, uuid, text);
drop function public.admin_switch_event_v0(uuid, text, text, timestamptz, timestamptz, uuid, text);
drop function public.switch_event(uuid, text, text, timestamptz, timestamptz);

drop index public.events_one_current;
alter table public.events drop column is_current;

alter table public.events alter column community_id set not null;

commit;
