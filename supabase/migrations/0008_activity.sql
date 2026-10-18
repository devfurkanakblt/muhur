-- Yemek ve mini oyun saatleri kodda sabit değil; yönetici duyurur, bitirir.
begin;

alter table public.events
  add column activity_kind text check (activity_kind in ('yemek', 'oyun')),
  add column activity_title text check (activity_title is null or (char_length(activity_title) between 2 and 60 and activity_title !~ '[[:cntrl:]]')),
  add column activity_at timestamptz,
  add constraint events_activity_complete check ((activity_kind is null) = (activity_title is null) and (activity_kind is null) = (activity_at is null));

-- 'activity': {"kind": "yemek"|"oyun", "title": "..."} başlatır; null bitirir.
create or replace function public.admin_update_event(p_event uuid, p_actor uuid, p_login text, p_action text, p_changes jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare b events; a events; act jsonb := p_changes->'activity';
begin
  if exists(select 1 from jsonb_object_keys(p_changes) k where k not in ('starts_at', 'deadline', 'announcement', 'voting', 'activity')) then
    raise exception 'Geçersiz etkinlik alanı.';
  end if;
  if p_changes ? 'activity' and jsonb_typeof(act) not in ('null', 'object') then
    raise exception 'Geçersiz etkinlik alanı.';
  end if;
  select * into b from events where id = p_event for update;
  if not found then raise exception 'Etkinlik bulunamadı.'; end if;
  update events set
    starts_at = case when p_changes ? 'starts_at' then (p_changes->>'starts_at')::timestamptz else starts_at end,
    deadline = case when p_changes ? 'deadline' then (p_changes->>'deadline')::timestamptz else deadline end,
    announcement = case when p_changes ? 'announcement' then nullif(btrim(p_changes->>'announcement'), '') else announcement end,
    announcement_at = case when p_changes ? 'announcement'
      then case when nullif(btrim(p_changes->>'announcement'), '') is null then null else clock_timestamp() end
      else announcement_at end,
    voting = case when p_changes ? 'voting' then p_changes->>'voting' else voting end,
    activity_kind = case when p_changes ? 'activity' then act->>'kind' else activity_kind end,
    activity_title = case when p_changes ? 'activity' then nullif(btrim(act->>'title'), '') else activity_title end,
    activity_at = case when p_changes ? 'activity'
      then case when jsonb_typeof(act) = 'object' then clock_timestamp() else null end
      else activity_at end
  where id = p_event returning * into a;
  perform public.log_admin(p_actor, p_login, p_action, p_event, null,
    jsonb_build_object('starts_at', b.starts_at, 'deadline', b.deadline, 'announcement', b.announcement, 'voting', b.voting, 'activity_kind', b.activity_kind, 'activity_title', b.activity_title),
    jsonb_build_object('starts_at', a.starts_at, 'deadline', a.deadline, 'announcement', a.announcement, 'voting', a.voting, 'activity_kind', a.activity_kind, 'activity_title', a.activity_title));
end $$;

revoke execute on function public.admin_update_event(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_event(uuid, uuid, text, text, jsonb) to service_role;

commit;
