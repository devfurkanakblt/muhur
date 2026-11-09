-- Çoklu topluluk temeli: topluluklar, üyelikler, platform rolü (head admin) ve etkinlik jürileri.
-- Geriye uyumlu: mevcut RPC imzaları değişmez; events.community_id bu aşamada nullable kalır.
begin;

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null check (char_length(name) between 2 and 80),
  university text,
  city text,
  link text,
  status text not null default 'beklemede' check (status in ('beklemede', 'onaylandi', 'reddedildi', 'askida')),
  contact_name text,
  contact_email text,
  contact_phone text,
  applicant_id uuid references auth.users(id),
  review_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  suspended_reason text,
  telegram_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  github_login text not null,
  role text not null check (role in ('owner', 'organizator')),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
-- Her toplulukta tek sahip.
create unique index community_one_owner on public.community_members(community_id) where role = 'owner';
create index community_members_user on public.community_members(user_id);

create table public.platform_roles (
  user_id uuid primary key references auth.users(id),
  login text not null,
  role text not null check (role = 'head_admin'),
  created_at timestamptz not null default now()
);

create table public.event_jurors (
  event_id uuid not null references public.events(id),
  user_id uuid not null references auth.users(id),
  login text not null,
  provider text not null check (provider in ('github', 'linkedin')),
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_jurors_user on public.event_jurors(user_id);

alter table public.events
  add column community_id uuid references public.communities(id),
  add column suspended_at timestamptz,
  add column suspended_reason text check (suspended_reason is null or char_length(suspended_reason) <= 500),
  add column suspended_by uuid;
create index events_community on public.events(community_id);

-- Seed: mevcut tüm etkinlikler DEÜ CS&AI topluluğuna bağlanır.
insert into public.communities(slug, name, university, city, status, telegram_enabled)
values ('deu-csai', 'DEÜ CS&AI', 'Dokuz Eylül Üniversitesi', 'İzmir', 'onaylandi', true);
update public.events set community_id = (select id from public.communities where slug = 'deu-csai') where community_id is null;

alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.platform_roles enable row level security;
alter table public.event_jurors enable row level security;
revoke all on public.communities, public.community_members, public.platform_roles, public.event_jurors from anon, authenticated;
grant select, insert, update, delete on public.communities, public.community_members, public.platform_roles, public.event_jurors to service_role;

create function public.is_head_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from platform_roles where user_id = p_user and role = 'head_admin')
$$;

-- Topluluk rolü (owner/organizator) jüriden önce gelir; head admin etkinlik rolü sayılmaz.
create function public.event_role(p_event uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.role from events e join community_members m on m.community_id = e.community_id
      where e.id = p_event and m.user_id = p_user),
    (select 'juri' from event_jurors where event_id = p_event and user_id = p_user))
$$;

-- İlk head admin: yalnızca hiç head admin yokken çalışır; kullanıcıyı DEÜ CS&AI sahibi de yapar.
create function public.bootstrap_head_admin(p_user uuid, p_login text) returns boolean
language plpgsql security definer set search_path = public as $$
declare deu uuid;
begin
  lock table platform_roles in share row exclusive mode;
  if exists(select 1 from platform_roles where role = 'head_admin') then return false; end if;
  insert into platform_roles(user_id, login, role) values (p_user, p_login, 'head_admin');
  select id into deu from communities where slug = 'deu-csai';
  if deu is not null then
    -- Önceki sahip varsa organizatöre indirilir; tek sahip kuralı korunur.
    update community_members set role = 'organizator' where community_id = deu and role = 'owner' and user_id <> p_user;
    insert into community_members(community_id, user_id, github_login, role) values (deu, p_user, p_login, 'owner')
    on conflict (community_id, user_id) do update set role = 'owner', github_login = excluded.github_login;
  end if;
  perform public.log_admin(p_user, p_login, 'bootstrap_head_admin', null, null, null,
    jsonb_build_object('community', 'deu-csai'));
  return true;
end $$;

revoke execute on function public.is_head_admin(uuid), public.event_role(uuid, uuid), public.bootstrap_head_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.is_head_admin(uuid), public.event_role(uuid, uuid), public.bootstrap_head_admin(uuid, text) to service_role;

-- Katılımcı tarafı: askı ve yarışma yasağı ------------------------------------------------------
-- Askıdaki etkinlikte katılımcı yazamaz. Topluluğun askıda olması katılımcıyı durdurmaz.
-- Etkinlik satırı FOR SHARE kilitlenir: askıya alma, süren yazma bitene kadar bekler.
create function public.assert_participant_writable(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s timestamptz;
begin
  if p_event is null then return; end if;
  select suspended_at into s from events where id = p_event for share;
  if s is not null then
    raise exception 'ASKIDA: Bu etkinlik platform tarafından geçici olarak durduruldu.' using errcode = 'P0001';
  end if;
end $$;

-- Topluluk sahibi, organizatör ve jüri kendi etkinliğinde yarışamaz.
create function public.assert_can_compete(p_event uuid, p_user uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.event_role(p_event, p_user) is not null then
    raise exception 'YARISAMAZ: Bu etkinlikte organizatör ya da jürisin; yarışmaya katılamazsın.' using errcode = 'P0001';
  end if;
end $$;

-- new.event_id members_guard (guard_members) tarafından doldurulur; tetikleyiciler ada göre sıralandığından
-- bu tetikleyici ondan sonra çalışır. register_project ve join_project_by_code yollarının ikisini de kapsar.
create function public.guard_members_competition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_compete(new.event_id, new.user_id);
  return new;
end $$;
create trigger members_zz_competition_guard before insert on public.project_members
for each row execute function public.guard_members_competition();

create function public.guard_votes_tenancy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_participant_writable(new.event_id);
  if public.event_role(new.event_id, new.user_id) = 'juri' then
    raise exception 'YARISAMAZ: Jüri kendi etkinliğinde oy veremez.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger votes_tenancy_guard before insert on public.votes
for each row execute function public.guard_votes_tenancy();

-- Katılımcı RPC'leri: eski gövde _v0 adıyla saklanır, aynı imzalı sarmalayıcı önce askıyı denetler.
-- İmza ve dönüş tipi değişmez; uygulama kodu aynı adları çağırmaya devam eder.
alter function public.register_project(uuid, uuid, text, text, text, text, text, bigint, text, text, text, text, text) rename to register_project_v0;
create function public.register_project(
  p_event uuid, p_user uuid, p_login text, p_avatar text, p_name text, p_team text,
  p_summary text, p_repo_id bigint, p_repo_name text, p_repo_url text, p_branch text,
  p_demo text default null, p_sha text default null
) returns public.projects language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_participant_writable(p_event);
  return public.register_project_v0(p_event, p_user, p_login, p_avatar, p_name, p_team, p_summary,
    p_repo_id, p_repo_name, p_repo_url, p_branch, p_demo, p_sha);
end $$;

alter function public.join_project_by_code(text, uuid, text, text) rename to join_project_by_code_v0;
create function public.join_project_by_code(p_code text, p_user uuid, p_login text, p_avatar text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_participant_writable((select event_id from projects where invite_code = p_code));
  return public.join_project_by_code_v0(p_code, p_user, p_login, p_avatar);
end $$;

alter function public.leave_project(uuid, uuid) rename to leave_project_v0;
create function public.leave_project(p_event uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_participant_writable(p_event);
  return public.leave_project_v0(p_event, p_user);
end $$;

alter function public.update_project(uuid, uuid, text, text, text, text, text, boolean) rename to update_project_v0;
create function public.update_project(p_project uuid, p_actor uuid, p_name text, p_team text, p_summary text,
  p_demo text, p_logo text default null, p_replace_logo boolean default false)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_participant_writable((select event_id from projects where id = p_project));
  return public.update_project_v0(p_project, p_actor, p_name, p_team, p_summary, p_demo, p_logo, p_replace_logo);
end $$;

alter function public.withdraw_project(uuid, uuid, text) rename to withdraw_project_v0;
create function public.withdraw_project(p_project uuid, p_actor uuid, p_confirmation text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_participant_writable((select event_id from projects where id = p_project));
  return public.withdraw_project_v0(p_project, p_actor, p_confirmation);
end $$;

alter function public.remove_member(uuid, uuid, uuid) rename to remove_member_v0;
create function public.remove_member(p_project uuid, p_actor uuid, p_target uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_participant_writable((select event_id from projects where id = p_project));
  return public.remove_member_v0(p_project, p_actor, p_target);
end $$;

alter function public.renew_invite(uuid, uuid, text) rename to renew_invite_v0;
create function public.renew_invite(p_project uuid, p_actor uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_participant_writable((select event_id from projects where id = p_project));
  perform public.renew_invite_v0(p_project, p_actor, p_code);
end $$;

alter function public.transfer_project_owner(uuid, uuid, uuid) rename to transfer_project_owner_v0;
create function public.transfer_project_owner(p_project uuid, p_owner uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_participant_writable((select event_id from projects where id = p_project));
  perform public.transfer_project_owner_v0(p_project, p_owner, p_target);
end $$;

-- Yalnızca yeni kuyruk girişi durur; kuyruktaki işler claim/complete ile işlenmeye devam eder.
alter function public.enqueue_submission(uuid, uuid, text, text, text) rename to enqueue_submission_v0;
create function public.enqueue_submission(p_project uuid, p_user uuid, p_sha text, p_branch text, p_repo_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_participant_writable((select event_id from projects where id = p_project));
  return public.enqueue_submission_v0(p_project, p_user, p_sha, p_branch, p_repo_name);
end $$;

alter function public.claim_mystery(uuid, uuid, text) rename to claim_mystery_v0;
create function public.claim_mystery(p_event uuid, p_user uuid, p_login text)
returns timestamptz language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_participant_writable(p_event);
  return public.claim_mystery_v0(p_event, p_user, p_login);
end $$;

revoke execute on function
  public.register_project_v0(uuid, uuid, text, text, text, text, text, bigint, text, text, text, text, text),
  public.join_project_by_code_v0(text, uuid, text, text), public.leave_project_v0(uuid, uuid),
  public.update_project_v0(uuid, uuid, text, text, text, text, text, boolean),
  public.withdraw_project_v0(uuid, uuid, text), public.remove_member_v0(uuid, uuid, uuid),
  public.renew_invite_v0(uuid, uuid, text), public.transfer_project_owner_v0(uuid, uuid, uuid),
  public.enqueue_submission_v0(uuid, uuid, text, text, text), public.claim_mystery_v0(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function
  public.assert_participant_writable(uuid), public.assert_can_compete(uuid, uuid),
  public.guard_members_competition(), public.guard_votes_tenancy(),
  public.register_project(uuid, uuid, text, text, text, text, text, bigint, text, text, text, text, text),
  public.join_project_by_code(text, uuid, text, text), public.leave_project(uuid, uuid),
  public.update_project(uuid, uuid, text, text, text, text, text, boolean),
  public.withdraw_project(uuid, uuid, text), public.remove_member(uuid, uuid, uuid),
  public.renew_invite(uuid, uuid, text), public.transfer_project_owner(uuid, uuid, uuid),
  public.enqueue_submission(uuid, uuid, text, text, text), public.claim_mystery(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.assert_participant_writable(uuid), public.assert_can_compete(uuid, uuid),
  public.register_project(uuid, uuid, text, text, text, text, text, bigint, text, text, text, text, text),
  public.join_project_by_code(text, uuid, text, text), public.leave_project(uuid, uuid),
  public.update_project(uuid, uuid, text, text, text, text, text, boolean),
  public.withdraw_project(uuid, uuid, text), public.remove_member(uuid, uuid, uuid),
  public.renew_invite(uuid, uuid, text), public.transfer_project_owner(uuid, uuid, uuid),
  public.enqueue_submission(uuid, uuid, text, text, text), public.claim_mystery(uuid, uuid, text)
  to service_role;

commit;
