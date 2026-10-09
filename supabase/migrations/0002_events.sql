-- mühür · çoklu etkinlik, ara mühürler, repo sağlığı, oylama
-- 0001'deki tek satırlık event_settings yerine etkinlik tablosu. Veritabanı boşken uygulandı.

drop table if exists public.project_members cascade;
drop table if exists public.projects cascade;
drop table if exists public.event_settings cascade;
drop function if exists public.is_locked() cascade;
drop function if exists public.guard_projects() cascade;
drop function if exists public.guard_members() cascade;
drop function if exists public.guard_settings() cascade;

-- Etkinlikler ----------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  title text not null check (char_length(title) between 3 and 80),
  starts_at timestamptz not null,
  deadline timestamptz not null,
  locked_at timestamptz,
  locked_by text,
  is_current boolean not null default false,
  announcement text check (announcement is null or char_length(announcement) <= 160),
  announcement_at timestamptz,
  voting text not null default 'kapali' check (voting in ('kapali', 'acik', 'sonuclandi')),
  created_at timestamptz not null default now(),
  check (starts_at < deadline)
);
create unique index events_one_current on public.events (is_current) where is_current;

create or replace function public.is_locked(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(locked_at is not null or now() >= deadline, false) from events where id = ev
$$;

-- Kilit geri alınamaz; kilitten sonra zamanlar değişmez.
create or replace function public.guard_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'LOCKED: Etkinlikler silinemez.' using errcode = 'P0001';
  end if;
  if old.locked_at is not null or now() >= old.deadline then
    if (new.deadline, new.starts_at) is distinct from (old.deadline, old.starts_at) then
      raise exception 'LOCKED: Kilit sonrası etkinlik zamanları değiştirilemez.' using errcode = 'P0001';
    end if;
    if old.locked_at is not null and new.locked_at is distinct from old.locked_at then
      raise exception 'LOCKED: Kilit geri alınamaz.' using errcode = 'P0001';
    end if;
  end if;
  if new.voting <> 'kapali' and not public.is_locked(old.id) then
    raise exception 'LOCKED: Oylama yalnızca kilitten sonra açılabilir.' using errcode = 'P0001';
  end if;
  if old.voting = 'sonuclandi' and new.voting <> 'sonuclandi' then
    raise exception 'LOCKED: Sonuçlanan oylama yeniden açılamaz.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger events_guard before update or delete on public.events
for each row execute function public.guard_events();

-- Eserler --------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  exhibit_no integer not null,
  name text not null check (char_length(name) between 2 and 60),
  team_name text not null check (char_length(team_name) between 2 and 60),
  summary text not null check (char_length(summary) between 10 and 280),
  logo_path text,
  repo_id bigint not null,
  repo_full_name text not null,
  repo_url text not null,
  default_branch text not null,
  invite_code text not null unique default encode(gen_random_bytes(9), 'hex'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Repo sağlığı ve nabız (zamanlayıcı günceller)
  repo_created_at timestamptz,
  repo_size_kb integer,
  last_pushed_at timestamptz,
  pre_event_commits boolean,
  health_issues text[] not null default '{}',
  health_checked_at timestamptz,
  -- Mühür
  frozen_sha text,
  frozen_at timestamptz,
  frozen_method text,            -- 'events' | 'head' | 'ara-muhur'
  archive_path text,
  archive_bytes bigint,
  archive_sha256 text,
  freeze_error text,
  unique (event_id, exhibit_no),
  unique (event_id, repo_id)
);
create index projects_archive_sha256 on public.projects (archive_sha256);

-- Eser numarası etkinlik içinde 1'den başlar.
create or replace function public.assign_exhibit_no() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.event_id::text));
  select coalesce(max(exhibit_no), 0) + 1 into new.exhibit_no from projects where event_id = new.event_id;
  return new;
end $$;

create trigger projects_a_assign_no before insert on public.projects
for each row execute function public.assign_exhibit_no();

create or replace function public.guard_projects() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_locked(coalesce(new.event_id, old.event_id)) then
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'UPDATE' then
      if new.event_id is distinct from old.event_id then
        raise exception 'LOCKED: Eser başka etkinliğe taşınamaz.' using errcode = 'P0001';
      end if;
      new.updated_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'LOCKED: Teslim süresi doldu, yeni proje kabul edilmiyor.' using errcode = 'P0001';
  elsif tg_op = 'DELETE' then
    raise exception 'LOCKED: Kilitli proje silinemez.' using errcode = 'P0001';
  end if;

  if (new.event_id, new.exhibit_no, new.name, new.team_name, new.summary, new.logo_path, new.repo_id,
      new.repo_full_name, new.repo_url, new.default_branch, new.invite_code, new.created_by, new.created_at)
     is distinct from
     (old.event_id, old.exhibit_no, old.name, old.team_name, old.summary, old.logo_path, old.repo_id,
      old.repo_full_name, old.repo_url, old.default_branch, old.invite_code, old.created_by, old.created_at) then
    raise exception 'LOCKED: Teslim süresi doldu, proje bilgileri değiştirilemez.' using errcode = 'P0001';
  end if;

  if old.archive_sha256 is not null and
     (new.frozen_sha, new.frozen_method, new.archive_path, new.archive_sha256, new.archive_bytes, new.frozen_at)
     is distinct from
     (old.frozen_sha, old.frozen_method, old.archive_path, old.archive_sha256, old.archive_bytes, old.frozen_at) then
    raise exception 'LOCKED: Mühürlenmiş arşiv değiştirilemez.' using errcode = 'P0001';
  end if;

  return new;
end $$;

create trigger projects_b_lock_guard before insert or update or delete on public.projects
for each row execute function public.guard_projects();

-- Ekipler --------------------------------------------------------------------------

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  github_login text not null,
  avatar_url text,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id),
  unique (event_id, user_id) -- bir etkinlikte bir kişi yalnızca bir ekipte
);

create or replace function public.guard_members() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev uuid;
begin
  if tg_op <> 'DELETE' then
    select event_id into ev from projects where id = new.project_id;
    new.event_id := ev;
  else
    ev := old.event_id;
  end if;
  if public.is_locked(ev) then
    -- Kilitli eserin silinmesi zaten engelli; burada yalnızca üyelik değişikliği reddedilir.
    raise exception 'LOCKED: Teslim süresi doldu, ekip değiştirilemez.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger members_guard before insert or update or delete on public.project_members
for each row execute function public.guard_members();

-- Ara mühürler ---------------------------------------------------------------------
-- Son saatlerde düzenli alınan kopyalar. Kilit anında repoya ulaşılamazsa son ara mühür kullanılır.

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sha text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  archive_path text not null,
  archive_bytes bigint not null,
  archive_sha256 text not null,
  unique (project_id, sha)
);

-- Halkın seçimi ---------------------------------------------------------------------

create table public.votes (
  event_id uuid not null references public.events (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  github_login text not null,
  voted_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index votes_project on public.votes (project_id);

create or replace function public.guard_votes() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev uuid; state text;
begin
  ev := coalesce(new.event_id, old.event_id);
  select voting into state from events where id = ev;
  if state is distinct from 'acik' then
    raise exception 'VOTING: Oylama açık değil.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if not exists (select 1 from projects where id = new.project_id and event_id = ev) then
    raise exception 'VOTING: Eser bu etkinliğe ait değil.' using errcode = 'P0001';
  end if;
  if exists (select 1 from project_members where project_id = new.project_id and user_id = new.user_id) then
    raise exception 'VOTING: Kendi ekibine oy veremezsin.' using errcode = 'P0001';
  end if;
  new.voted_at := now();
  return new;
end $$;

create trigger votes_guard before insert or update or delete on public.votes
for each row execute function public.guard_votes();

-- Erişim: RLS açık, politika yok. Tüm okuma/yazma sunucuda service role ile.
alter table public.events enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.snapshots enable row level security;
alter table public.votes enable row level security;
revoke all on public.events, public.projects, public.project_members, public.snapshots, public.votes from anon, authenticated;
revoke execute on function public.is_locked(uuid), public.guard_events(), public.assign_exhibit_no(),
  public.guard_projects(), public.guard_members(), public.guard_votes() from anon, authenticated, public;

-- İlk etkinlik: 0001'deki son tarih korunur, başlangıç 48 saat öncesi.
insert into public.events (slug, title, starts_at, deadline, is_current)
values ('2026-guz', 'DEÜ CS&AI Hackathon', '2026-10-09 10:28:36+00', '2026-10-11 10:28:36+00', true);
