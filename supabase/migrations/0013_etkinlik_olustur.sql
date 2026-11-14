-- Etkinlik oluşturma ve katılımın "güncel etkinlik"ten bağımsızlaşması. Yalnızca ekler ve gevşetir:
-- eski kod (switch_event) çalışmaya devam eder; is_current kaldırması 0014'e kalır.
begin;

-- Kayıt ve ekibe katılım artık events.is_current'a bakmaz; etkinlik kilidi (is_locked) ve 0012 askı sarmalayıcısı aynen geçerli.
-- Gövdeler 0004 (register_project) ve 0005 (join_project_by_code) ile aynıdır; tek fark "and is_current" koşulunun kalkmasıdır.
-- create or replace izinleri korur: 0012'deki revoke (service_role dahil) bozulmaz.
create or replace function public.register_project_v0(
  p_event uuid, p_user uuid, p_login text, p_avatar text, p_name text, p_team text,
  p_summary text, p_repo_id bigint, p_repo_name text, p_repo_url text, p_branch text,
  p_demo text default null, p_sha text default null
) returns public.projects language plpgsql security definer set search_path = public as $$
declare result projects;
begin
  perform id from events where id = p_event for share;
  if not found or public.is_locked(p_event) then raise exception 'LOCKED: Teslim kapalı.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_event::text || p_user::text));
  if exists(select 1 from project_members where event_id = p_event and user_id = p_user) then
    raise exception 'MEMBER: Zaten bir projenin ekibindesin.';
  end if;
  insert into projects(event_id, exhibit_no, name, team_name, summary, repo_id, repo_full_name,
    repo_url, default_branch, created_by, demo_url)
  values(p_event, 0, p_name, p_team, p_summary, p_repo_id, p_repo_name, p_repo_url, p_branch, p_user, p_demo)
  returning * into result;
  insert into project_members(project_id, event_id, user_id, github_login, avatar_url, role)
  values(result.id, p_event, p_user, p_login, p_avatar, 'owner');
  insert into project_timeline(project_id, kind) values(result.id, 'registered');
  if p_sha is not null then
    insert into delivery_jobs(project_id, event_id, kind, sha, branch, repo_full_name)
      values(result.id, p_event, 'submit', p_sha, p_branch, p_repo_name);
  end if;
  return result;
end $$;

create or replace function public.join_project_by_code_v0(p_code text, p_user uuid, p_login text, p_avatar text)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; ev uuid;
begin
  if p_code is null or p_code !~ '^[a-f0-9]{18}$' then
    raise exception 'TEAM: Davet bağlantısı geçersiz ya da yenilenmiş.';
  end if;
  select id, event_id into pid, ev from projects where invite_code = p_code;
  if pid is null then raise exception 'TEAM: Davet bağlantısı geçersiz ya da yenilenmiş.'; end if;
  perform id from events where id = ev for share;
  if not found or public.is_locked(ev) then raise exception 'LOCKED: Teslim kapalı.'; end if;
  perform pg_advisory_xact_lock(hashtext(ev::text || p_user::text));
  perform 1 from projects where id = pid and invite_code = p_code for update;
  if not found then raise exception 'TEAM: Davet bağlantısı geçersiz ya da yenilenmiş.'; end if;
  if exists(select 1 from project_members where event_id = ev and user_id = p_user) then
    raise exception 'MEMBER: Zaten bir projenin ekibindesin.';
  end if;
  insert into project_members(project_id, event_id, user_id, github_login, avatar_url, role)
  values(pid, ev, p_user, p_login, p_avatar, 'member');
  insert into project_timeline(project_id, kind, actor_id) values(pid, 'member_joined', p_user);
  return pid;
end $$;

-- Topluluğun sahibi ya da organizatörü, topluluğuna yeni etkinlik ekler. Etkinlik güncel yapılmaz (is_current false);
-- aynı topluluğun birden çok etkinliği aynı anda açık olabilir. Head admin üye değilse etkinlik oluşturamaz.
-- Topluluk satırı FOR SHARE kilitlenir: askıya alma süren oluşturma bitene kadar bekler.
create function public.admin_create_event(p_community uuid, p_title text, p_slug text, p_starts timestamptz,
  p_deadline timestamptz, p_actor uuid, p_login text)
returns uuid language plpgsql security definer set search_path = public as $$
declare st text; new_id uuid;
begin
  select status into st from communities where id = p_community for share;
  if not found
    or p_actor is null
    or not exists(select 1 from community_members
      where community_id = p_community and user_id = p_actor and role in ('owner', 'organizator')) then
    raise exception 'YETKI: Bu toplulukta etkinlik oluşturma yetkin yok.' using errcode = 'P0001';
  end if;
  if st = 'askida' then
    raise exception 'ASKIDA: Bu topluluk platform tarafından geçici olarak durduruldu.' using errcode = 'P0001';
  end if;
  if st <> 'onaylandi' then
    raise exception 'YETKI: Bu toplulukta etkinlik oluşturma yetkin yok.' using errcode = 'P0001';
  end if;
  if p_title is null or char_length(p_title) not between 3 and 80
    or p_slug is null or p_slug !~ '^[a-z0-9-]{3,40}$'
    or p_starts is null or p_deadline is null
    or p_starts >= p_deadline or p_deadline <= clock_timestamp() then
    raise exception 'Etkinlik bilgileri geçersiz.' using errcode = 'P0001';
  end if;
  insert into events(title, slug, starts_at, deadline, community_id)
  values (p_title, p_slug, p_starts, p_deadline, p_community)
  returning id into new_id;
  perform public.log_admin(p_actor, p_login, 'event_created', new_id, null, null,
    jsonb_build_object('title', p_title, 'slug', p_slug, 'starts_at', p_starts, 'deadline', p_deadline, 'community', p_community));
  return new_id;
end $$;

revoke all on function public.admin_create_event(uuid, text, text, timestamptz, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_create_event(uuid, text, text, timestamptz, timestamptz, uuid, text)
  to service_role;

commit;
