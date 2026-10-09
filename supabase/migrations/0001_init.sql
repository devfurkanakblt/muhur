-- DEÜ CS&AI · Proje Kilidi
-- Tüm yazmalar sunucudan (service role) yapılır; istemci yalnızca okur.
-- Kilit kuralı veritabanında da uygulanır: kilitlendikten sonra proje/ekip verisi değişemez.

create extension if not exists pgcrypto;

-- Tek satırlık etkinlik ayarı
create table public.event_settings (
  id smallint primary key default 1 check (id = 1),
  title text not null default 'DEÜ CS&AI Hackathon',
  deadline timestamptz not null default (now() + interval '7 days'),
  locked_at timestamptz,
  locked_by text,
  updated_at timestamptz not null default now()
);
insert into public.event_settings (id) values (1);

create or replace function public.is_locked() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(locked_at is not null or now() >= deadline, false)
  from event_settings where id = 1
$$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  exhibit_no integer generated always as identity unique,
  name text not null check (char_length(name) between 2 and 60),
  team_name text not null check (char_length(team_name) between 2 and 60),
  summary text not null check (char_length(summary) between 10 and 280),
  logo_path text,
  repo_id bigint not null unique,
  repo_full_name text not null,
  repo_url text not null,
  default_branch text not null,
  invite_code text not null unique default encode(gen_random_bytes(9), 'hex'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Mühür (kilit anında doldurulur)
  frozen_sha text,
  frozen_at timestamptz,
  frozen_method text,            -- 'events' | 'head'
  archive_path text,
  archive_bytes bigint,
  archive_sha256 text,
  freeze_error text
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  github_login text not null,
  avatar_url text,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id),
  unique (user_id) -- bir kişi yalnızca bir projede
);

-- Kilit tetikleyicileri ---------------------------------------------------------

create or replace function public.guard_projects() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_locked() then
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'LOCKED: Teslim süresi doldu, yeni proje kabul edilmiyor.' using errcode = 'P0001';
  elsif tg_op = 'DELETE' then
    raise exception 'LOCKED: Kilitli proje silinemez.' using errcode = 'P0001';
  end if;

  -- Kilitten sonra yalnızca mühür alanları ve yalnızca bir kez yazılabilir.
  if (new.name, new.team_name, new.summary, new.logo_path, new.repo_id, new.repo_full_name,
      new.repo_url, new.default_branch, new.invite_code, new.created_by, new.created_at)
     is distinct from
     (old.name, old.team_name, old.summary, old.logo_path, old.repo_id, old.repo_full_name,
      old.repo_url, old.default_branch, old.invite_code, old.created_by, old.created_at) then
    raise exception 'LOCKED: Teslim süresi doldu, proje bilgileri değiştirilemez.' using errcode = 'P0001';
  end if;

  if old.archive_sha256 is not null and
     (new.frozen_sha, new.archive_path, new.archive_sha256, new.archive_bytes, new.frozen_at)
     is distinct from
     (old.frozen_sha, old.archive_path, old.archive_sha256, old.archive_bytes, old.frozen_at) then
    raise exception 'LOCKED: Mühürlenmiş arşiv değiştirilemez.' using errcode = 'P0001';
  end if;

  return new;
end $$;

create trigger projects_lock_guard
before insert or update or delete on public.projects
for each row execute function public.guard_projects();

create or replace function public.guard_members() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_locked() then
    raise exception 'LOCKED: Teslim süresi doldu, ekip değiştirilemez.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger members_lock_guard
before insert or update or delete on public.project_members
for each row execute function public.guard_members();

-- Kilit geri alınamaz; son tarih kilitten sonra değiştirilemez.
create or replace function public.guard_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.locked_at is not null or now() >= old.deadline then
    if new.deadline is distinct from old.deadline then
      raise exception 'LOCKED: Kilit sonrası son tarih değiştirilemez.' using errcode = 'P0001';
    end if;
    if old.locked_at is not null and new.locked_at is distinct from old.locked_at then
      raise exception 'LOCKED: Kilit geri alınamaz.' using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger settings_lock_guard
before update on public.event_settings
for each row execute function public.guard_settings();

-- RLS açık, politika yok: anon/authenticated rolleri hiçbir şey okuyamaz ya da yazamaz.
-- Uygulama tüm okuma ve yazmaları sunucuda service role ile, kilit kontrolünden sonra yapar.
alter table public.event_settings enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
revoke all on public.event_settings, public.projects, public.project_members from anon, authenticated;
revoke execute on function public.is_locked() from anon, authenticated, public;

-- Depolama: logolar herkese açık, arşivler özel.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit)
values ('archives', 'archives', false, 52428800)
on conflict (id) do nothing;

revoke execute on function public.guard_projects(), public.guard_members(), public.guard_settings() from anon, authenticated, public;
