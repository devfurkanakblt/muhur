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

commit;
