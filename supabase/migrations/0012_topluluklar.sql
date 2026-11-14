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

-- Katılımcı salt okunurluğu tablo yazmalarına da uzanır: oy geri çekme ve maskot isim etkinliği.
-- Oy silme yalnızca doğrudan silmede denetlenir (pg_trigger_depth() = 1); proje ya da hesap silinince
-- zincirleme silinen oylar engellenmez. Proje silme yolu (withdraw_project) zaten askıyı denetler.
create or replace function public.guard_votes_tenancy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then perform public.assert_participant_writable(old.event_id); end if;
    return old;
  end if;
  perform public.assert_participant_writable(new.event_id);
  if public.event_role(new.event_id, new.user_id) = 'juri' then
    raise exception 'YARISAMAZ: Jüri kendi etkinliğinde oy veremez.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger votes_tenancy_guard on public.votes;
create trigger votes_tenancy_guard before insert or delete on public.votes
for each row execute function public.guard_votes_tenancy();

-- Öneri ekleme ve isim düzenleme katılımcı yazmasıdır; görünürlük (moderasyon) ve anonimleştirme değildir.
create function public.guard_mascot_proposal_tenancy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    perform public.assert_participant_writable(new.event_id);
  end if;
  return new;
end $$;
create trigger mascot_name_proposal_tenancy_guard before insert or update on public.mascot_name_proposals
for each row execute function public.guard_mascot_proposal_tenancy();

create function public.guard_mascot_vote_tenancy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_participant_writable(new.event_id);
  return new;
end $$;
create trigger mascot_name_vote_tenancy_guard before insert on public.mascot_name_votes
for each row execute function public.guard_mascot_vote_tenancy();

-- Yönetim tarafı: etkinlik kapsamı ve askıya alma ---------------------------------------------
-- Yalnızca etkinliğin topluluğundaki sahip/organizatör yönetir; head admin rolü yoksa geçemez.
-- Etkinlik satırı FOR NO KEY UPDATE, topluluk satırı FOR SHARE kilitlenir: askıya alma süren yönetim
-- işlemi bitene kadar bekler. FOR SHARE yerine NO KEY UPDATE, eşzamanlı iki yönetim işleminin _v0
-- içindeki FOR UPDATE yükseltmesinde kilitlenmemesi için; katılımcıların FK (KEY SHARE) kilitleriyle çakışmaz.
create function public.require_event_manager(p_event uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s timestamptz; c uuid; cs text;
begin
  if p_actor is null or coalesce(public.event_role(p_event, p_actor), '') not in ('owner', 'organizator') then
    raise exception 'YETKI: Bu etkinliği yönetme yetkin yok.' using errcode = 'P0001';
  end if;
  select suspended_at, community_id into s, c from events where id = p_event for no key update;
  select status into cs from communities where id = c for share;
  if s is not null or cs = 'askida' then
    raise exception 'ASKIDA: Bu etkinlik platform tarafından geçici olarak durduruldu.' using errcode = 'P0001';
  end if;
end $$;

create function public.require_head_admin(p_actor uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_actor is null or not public.is_head_admin(p_actor) then
    raise exception 'YETKI: Bu işlem yalnızca platform yöneticisine açık.' using errcode = 'P0001';
  end if;
end $$;

create function public.require_reason(p_reason text) returns void
language plpgsql immutable set search_path = public as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'Platform işlemi için 3-500 karakterlik gerekçe gerekli.' using errcode = 'P0001';
  end if;
end $$;

-- Yönetim RPC'leri: eski gövde _v0 adıyla saklanır; sarmalayıcı önce etkinlik yetkisini ve askıyı denetler.
-- _v0 gövdeleri birbirini değil yalnızca switch_event / lock_delivery_event'i çağırır; bunlar sarmalanmaz
-- (cron kilidi askıdan etkilenmez).
alter function public.admin_update_event(uuid, uuid, text, text, jsonb) rename to admin_update_event_v0;
create function public.admin_update_event(p_event uuid, p_actor uuid, p_login text, p_action text, p_changes jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_event_manager(p_event, p_actor);
  perform public.admin_update_event_v0(p_event, p_actor, p_login, p_action, p_changes);
end $$;

alter function public.admin_lock_event(uuid, uuid, text) rename to admin_lock_event_v0;
create function public.admin_lock_event(p_event uuid, p_actor uuid, p_login text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.require_event_manager(p_event, p_actor);
  return public.admin_lock_event_v0(p_event, p_actor, p_login);
end $$;

alter function public.admin_add_award(uuid, uuid, text, text, uuid, text) rename to admin_add_award_v0;
create function public.admin_add_award(p_event uuid, p_project uuid, p_title text, p_reason text, p_actor uuid, p_login text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform public.require_event_manager(p_event, p_actor);
  return public.admin_add_award_v0(p_event, p_project, p_title, p_reason, p_actor, p_login);
end $$;

-- _v0 ödülü (id, event_id) çiftiyle siler: başka etkinliğin ödül id'si false döner.
alter function public.admin_remove_award(uuid, uuid, uuid, text) rename to admin_remove_award_v0;
create function public.admin_remove_award(p_award uuid, p_event uuid, p_actor uuid, p_login text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.require_event_manager(p_event, p_actor);
  return public.admin_remove_award_v0(p_award, p_event, p_actor, p_login);
end $$;

-- Yeni etkinlik, güncel etkinliğin topluluğuna bağlanır.
alter function public.admin_switch_event(uuid, text, text, timestamptz, timestamptz, uuid, text) rename to admin_switch_event_v0;
create function public.admin_switch_event(p_current uuid, p_title text, p_slug text, p_starts timestamptz,
  p_deadline timestamptz, p_actor uuid, p_login text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  perform public.require_event_manager(p_current, p_actor);
  new_id := public.admin_switch_event_v0(p_current, p_title, p_slug, p_starts, p_deadline, p_actor, p_login);
  update events set community_id = (select community_id from events where id = p_current) where id = new_id;
  return new_id;
end $$;

-- Anonimleştirme platform işlemidir: yalnızca head admin.
alter function public.anonymize_user(uuid, uuid, text, text) rename to anonymize_user_v0;
create function public.anonymize_user(p_user uuid, p_actor uuid, p_login text, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
begin
  perform public.require_head_admin(p_actor);
  return public.anonymize_user_v0(p_user, p_actor, p_login, p_reason);
end $$;

-- Etkinlik askısı: katılımcı ve yönetim yazmaları durur; kuyruktaki işler ve cron kilidi sürer.
create function public.suspend_event(p_event uuid, p_actor uuid, p_login text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare b events;
begin
  perform public.require_head_admin(p_actor);
  perform public.require_reason(p_reason);
  select * into b from events where id = p_event for update;
  if not found then raise exception 'Etkinlik bulunamadı.'; end if;
  if b.suspended_at is not null then raise exception 'Etkinlik zaten askıda.'; end if;
  update events set suspended_at = clock_timestamp(), suspended_reason = btrim(p_reason), suspended_by = p_actor
  where id = p_event;
  perform public.log_admin(p_actor, p_login, 'event_suspended', p_event, null,
    jsonb_build_object('suspended', false), jsonb_build_object('suspended', true, 'suspended_reason', btrim(p_reason)), p_reason);
end $$;

create function public.unsuspend_event(p_event uuid, p_actor uuid, p_login text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare b events;
begin
  perform public.require_head_admin(p_actor);
  perform public.require_reason(p_reason);
  select * into b from events where id = p_event for update;
  if not found then raise exception 'Etkinlik bulunamadı.'; end if;
  if b.suspended_at is null then raise exception 'Etkinlik askıda değil.'; end if;
  update events set suspended_at = null, suspended_reason = null, suspended_by = null where id = p_event;
  perform public.log_admin(p_actor, p_login, 'event_unsuspended', p_event, null,
    jsonb_build_object('suspended', true, 'suspended_at', b.suspended_at, 'suspended_reason', b.suspended_reason, 'suspended_by', b.suspended_by),
    jsonb_build_object('suspended', false), p_reason);
end $$;

-- Topluluk askısı: topluluğun etkinlikleri yönetime kapanır (katılımcılar etkilenmez).
create function public.suspend_community(p_community uuid, p_actor uuid, p_login text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare b communities;
begin
  perform public.require_head_admin(p_actor);
  perform public.require_reason(p_reason);
  select * into b from communities where id = p_community for update;
  if not found then raise exception 'Topluluk bulunamadı.'; end if;
  if b.status <> 'onaylandi' then raise exception 'Yalnızca onaylı topluluk askıya alınabilir.'; end if;
  update communities set status = 'askida', suspended_reason = btrim(p_reason) where id = p_community;
  perform public.log_admin(p_actor, p_login, 'community_suspended', null, null,
    jsonb_build_object('community', b.id, 'status', b.status), jsonb_build_object('community', b.id, 'status', 'askida'), p_reason);
end $$;

create function public.unsuspend_community(p_community uuid, p_actor uuid, p_login text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare b communities;
begin
  perform public.require_head_admin(p_actor);
  perform public.require_reason(p_reason);
  select * into b from communities where id = p_community for update;
  if not found then raise exception 'Topluluk bulunamadı.'; end if;
  if b.status <> 'askida' then raise exception 'Topluluk askıda değil.'; end if;
  update communities set status = 'onaylandi', suspended_reason = null where id = p_community;
  perform public.log_admin(p_actor, p_login, 'community_unsuspended', null, null,
    jsonb_build_object('community', b.id, 'status', b.status, 'suspended_reason', b.suspended_reason),
    jsonb_build_object('community', b.id, 'status', 'onaylandi'), p_reason);
end $$;

-- Sahip hesabını kaybederse: eski sahip organizatöre iner, hedef sahip olur (üye değilse eklenir).
create function public.set_community_owner(p_community uuid, p_user uuid, p_login text, p_actor uuid,
  p_actor_login text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare old_owner uuid;
begin
  perform public.require_head_admin(p_actor);
  perform public.require_reason(p_reason);
  perform id from communities where id = p_community for update;
  if not found then raise exception 'Topluluk bulunamadı.'; end if;
  select user_id into old_owner from community_members where community_id = p_community and role = 'owner';
  update community_members set role = 'organizator' where community_id = p_community and role = 'owner' and user_id <> p_user;
  insert into community_members(community_id, user_id, github_login, role) values (p_community, p_user, p_login, 'owner')
  on conflict (community_id, user_id) do update set role = 'owner', github_login = excluded.github_login;
  perform public.log_admin(p_actor, p_actor_login, 'community_owner_set', null, null,
    jsonb_build_object('community', p_community, 'owner', old_owner),
    jsonb_build_object('community', p_community, 'owner', p_user, 'login', p_login), p_reason);
end $$;

revoke execute on function
  public.admin_update_event_v0(uuid, uuid, text, text, jsonb), public.admin_lock_event_v0(uuid, uuid, text),
  public.admin_add_award_v0(uuid, uuid, text, text, uuid, text), public.admin_remove_award_v0(uuid, uuid, uuid, text),
  public.admin_switch_event_v0(uuid, text, text, timestamptz, timestamptz, uuid, text),
  public.anonymize_user_v0(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function
  public.guard_mascot_proposal_tenancy(), public.guard_mascot_vote_tenancy(),
  public.require_event_manager(uuid, uuid), public.require_head_admin(uuid), public.require_reason(text),
  public.admin_update_event(uuid, uuid, text, text, jsonb), public.admin_lock_event(uuid, uuid, text),
  public.admin_add_award(uuid, uuid, text, text, uuid, text), public.admin_remove_award(uuid, uuid, uuid, text),
  public.admin_switch_event(uuid, text, text, timestamptz, timestamptz, uuid, text),
  public.anonymize_user(uuid, uuid, text, text),
  public.suspend_event(uuid, uuid, text, text), public.unsuspend_event(uuid, uuid, text, text),
  public.suspend_community(uuid, uuid, text, text), public.unsuspend_community(uuid, uuid, text, text),
  public.set_community_owner(uuid, uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function
  public.require_event_manager(uuid, uuid), public.require_head_admin(uuid),
  public.admin_update_event(uuid, uuid, text, text, jsonb), public.admin_lock_event(uuid, uuid, text),
  public.admin_add_award(uuid, uuid, text, text, uuid, text), public.admin_remove_award(uuid, uuid, uuid, text),
  public.admin_switch_event(uuid, text, text, timestamptz, timestamptz, uuid, text),
  public.anonymize_user(uuid, uuid, text, text),
  public.suspend_event(uuid, uuid, text, text), public.unsuspend_event(uuid, uuid, text, text),
  public.suspend_community(uuid, uuid, text, text), public.unsuspend_community(uuid, uuid, text, text),
  public.set_community_owner(uuid, uuid, text, uuid, text, text)
  to service_role;

commit;
