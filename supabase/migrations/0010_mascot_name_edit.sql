-- Yarışmacı kendi isim önerisini öneri aşaması boyunca düzenleyebilir.
-- Bu aşamada oy bulunmadığından isim değişikliği verilmiş bir oyun anlamını değiştirmez.
-- Yayından kaldırılan öneri, moderasyonu aşmamak için düzenlenemez.
begin;

create or replace function public.guard_mascot_name_proposal() returns trigger
language plpgsql security definer set search_path = public as $$
declare current_phase text;
begin
  if tg_op = 'DELETE' then
    raise exception 'MASCOT: Öneri silinemez.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and current_setting('muhur.anonymize', true) = 'on' and
    (new.id, new.event_id, new.author_id, new.name, new.visible, new.created_at)
      is not distinct from
    (old.id, old.event_id, old.author_id, old.name, old.visible, old.created_at) then
    return new;
  end if;
  select phase into current_phase from public.mascot_naming_rounds where event_id = new.event_id for update;
  if current_phase is distinct from 'oneriler' then
    raise exception 'MASCOT: Öneri aşaması kapalı.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.project_members
      where event_id = new.event_id and user_id = new.author_id
    ) then
      raise exception 'MASCOT: Yalnızca yarışmacılar isim önerebilir.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if (new.id, new.event_id, new.author_id, new.author_login, new.created_at)
    is distinct from (old.id, old.event_id, old.author_id, old.author_login, old.created_at) then
    raise exception 'MASCOT: Öneri değiştirilemez.' using errcode = 'P0001';
  end if;
  if new.name is distinct from old.name and not old.visible then
    raise exception 'MASCOT: Yayından kaldırılan öneri düzenlenemez.' using errcode = 'P0001';
  end if;
  return new;
end $$;

commit;
