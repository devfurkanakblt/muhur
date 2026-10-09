-- Kesin teslim: süre dolmadan doğrulanan arşiv kabul edilir; GitHub Events kanıt sayılmaz.
begin;

alter table public.projects
  add column demo_url text check (demo_url is null or (char_length(demo_url) <= 500 and demo_url ~ '^https://')),
  add column accepted_submission_id uuid,
  add column accepted_sha text,
  add column accepted_at timestamptz,
  add column accepted_branch text,
  add column accepted_archive_path text,
  add column accepted_archive_sha256 text,
  add column accepted_archive_bytes bigint,
  add column delivery_error text,
  add column repo_head_sha text;

create table public.submissions (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  sha text not null check (sha ~ '^[a-f0-9]{40}$'),
  branch text not null,
  archive_path text not null unique,
  archive_sha256 text not null check (archive_sha256 ~ '^[a-f0-9]{64}$'),
  archive_bytes bigint not null check (archive_bytes > 0 and archive_bytes <= 52428800),
  accepted_at timestamptz not null default clock_timestamp()
);

create table public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  event_id uuid not null references public.events(id),
  kind text not null check (kind in ('submit', 'seal')),
  state text not null default 'queued' check (state in ('queued', 'processing', 'completed', 'failed')),
  sha text,
  branch text,
  repo_full_name text,
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  error text,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);
create unique index delivery_jobs_one_active on public.delivery_jobs(project_id, kind)
  where state in ('queued', 'processing');
create index delivery_jobs_due on public.delivery_jobs(state, next_attempt_at);
alter table public.delivery_jobs add constraint delivery_jobs_sha_valid
  check (kind <> 'submit' or (sha ~ '^[a-f0-9]{40}$' and branch is not null and repo_full_name is not null));

create table public.project_timeline (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null,
  detail text,
  occurred_at timestamptz not null default clock_timestamp()
);
create index timeline_project_time on public.project_timeline(project_id, occurred_at desc);

create table public.worker_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  error text,
  processed integer not null default 0
);
create table public.event_reminders (
  event_id uuid not null references public.events(id),
  window_minutes integer not null check (window_minutes in (60, 15)),
  sent_at timestamptz,
  lease_until timestamptz not null default clock_timestamp() + interval '2 minutes',
  primary key(event_id, window_minutes)
);
create table public.awards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  project_id uuid not null references public.projects(id),
  title text not null check (char_length(title) between 2 and 80),
  reason text not null check (char_length(reason) between 10 and 280),
  created_at timestamptz not null default clock_timestamp(),
  unique(event_id, title)
);

-- Başarıyla yazılan kabul ve mühür alanları, arşiv tamamlanmadan da değiştirilemez.
create or replace function public.guard_delivery_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform id from events where id = new.event_id for share;
  if public.is_locked(new.event_id) and
    (new.demo_url, new.accepted_submission_id, new.accepted_sha, new.accepted_at,
     new.accepted_branch, new.accepted_archive_path, new.accepted_archive_sha256, new.accepted_archive_bytes)
    is distinct from
    (old.demo_url, old.accepted_submission_id, old.accepted_sha, old.accepted_at,
     old.accepted_branch, old.accepted_archive_path, old.accepted_archive_sha256, old.accepted_archive_bytes) then
    raise exception 'LOCKED: Teslim sürümü ve demo bağlantısı değiştirilemez.';
  end if;
  if old.frozen_sha is not null and new.frozen_sha is distinct from old.frozen_sha then
    raise exception 'LOCKED: Seçilen mühür commit kodu değiştirilemez.';
  end if;
  return new;
end $$;
create trigger projects_c_delivery_guard before update on public.projects
for each row execute function public.guard_delivery_fields();

create or replace function public.is_locked(ev uuid) returns boolean
language sql volatile security definer set search_path = public as $$
  select coalesce(locked_at is not null or clock_timestamp() >= deadline, true) from events where id = ev
$$;

create or replace function public.guard_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'LOCKED: Etkinlikler silinemez.'; end if;
  if old.locked_at is not null or clock_timestamp() >= old.deadline then
    if (new.deadline, new.starts_at) is distinct from (old.deadline, old.starts_at) then
      raise exception 'LOCKED: Kilit sonrası etkinlik zamanları değiştirilemez.';
    end if;
    if old.locked_at is not null and new.locked_at is distinct from old.locked_at then
      raise exception 'LOCKED: Kilit geri alınamaz.';
    end if;
  end if;
  if new.voting <> 'kapali' and not public.is_locked(old.id) then
    raise exception 'LOCKED: Oylama yalnızca kilitten sonra açılabilir.';
  end if;
  if old.voting = 'sonuclandi' and new.voting <> 'sonuclandi' then
    raise exception 'LOCKED: Sonuçlanan oylama yeniden açılamaz.';
  end if;
  return new;
end $$;

create function public.lock_event_for_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform id from events where id = coalesce(new.event_id, old.event_id) for share;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger projects_0_event_lock before insert or update or delete on public.projects
for each row execute function public.lock_event_for_write();
create trigger members_0_event_lock before insert or update or delete on public.project_members
for each row execute function public.lock_event_for_write();

create function public.guard_submission_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev uuid;
begin
  if tg_op = 'UPDATE' then raise exception 'LOCKED: Kabul edilmiş arşiv kaydı değiştirilemez.'; end if;
  select event_id into ev from projects where id = old.project_id;
  if ev is not null and public.is_locked(ev) then raise exception 'LOCKED: Kabul edilmiş arşiv silinemez.'; end if;
  return old;
end $$;
create trigger submissions_immutable before update or delete on public.submissions
for each row execute function public.guard_submission_record();

-- Erken kilidin zamanı uygulamada hesaplanmaz: event satırı alındıktan sonra DB saati kullanılır.
create function public.lock_delivery_event(p_event uuid, p_by text, p_force boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare ev events; at_time timestamptz;
begin
  select * into ev from events where id = p_event for update;
  if not found then raise exception 'Etkinlik bulunamadı.'; end if;
  if ev.locked_at is not null then return true; end if;
  at_time := clock_timestamp();
  if not p_force and at_time < ev.deadline then return false; end if;
  update events set locked_at = least(at_time, ev.deadline), locked_by = p_by where id = p_event;
  return true;
end $$;

-- Yeni kayıt + kurucu üyeliği + ilk teslim işi tek transaction.
create function public.register_project(
  p_event uuid, p_user uuid, p_login text, p_avatar text, p_name text, p_team text,
  p_summary text, p_repo_id bigint, p_repo_name text, p_repo_url text, p_branch text,
  p_demo text default null, p_sha text default null
) returns public.projects language plpgsql security definer set search_path = public as $$
declare result projects;
begin
  perform id from events where id = p_event and is_current for share;
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

create function public.enqueue_submission(p_project uuid, p_user uuid, p_sha text, p_branch text, p_repo_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare p projects; job_id uuid;
begin
  select * into p from projects where id = p_project;
  perform id from events where id = p.event_id for share;
  if not found or public.is_locked(p.event_id) then raise exception 'LOCKED: Teslim kapalı.'; end if;
  perform 1 from projects where id = p_project for update;
  if not exists(select 1 from project_members where project_id = p_project and user_id = p_user) then
    raise exception 'Yetkisiz';
  end if;
  if p_sha !~ '^[a-f0-9]{40}$' then raise exception 'Geçersiz commit'; end if;
  select id into job_id from delivery_jobs where project_id = p_project and kind = 'submit'
    and state in ('queued', 'processing');
  if job_id is not null then return job_id; end if;
  insert into delivery_jobs(project_id, event_id, kind, sha, branch, repo_full_name)
    values(p.id, p.event_id, 'submit', p_sha, p_branch, p_repo_name) returning id into job_id;
  update projects set delivery_error = null where id = p.id;
  insert into project_timeline(project_id, kind, detail) values(p.id, 'submission_requested', p_sha);
  return job_id;
end $$;

create function public.claim_delivery_jobs(p_project uuid default null, p_limit integer default 4)
returns setof public.delivery_jobs language plpgsql security definer set search_path = public as $$
declare exhausted delivery_jobs;
begin
  for exhausted in select * from delivery_jobs where state = 'processing' and attempts >= 5
    and lease_until < clock_timestamp() limit 8 loop
    perform id from events where id = exhausted.event_id for share;
    perform 1 from projects where id = exhausted.project_id for update skip locked;
    if not found then continue; end if;
    update delivery_jobs set state = 'failed', error = 'İşlem zaman aşımına uğradı; 5 deneme tamamlandı.',
      lease_until = null, completed_at = clock_timestamp() where id = exhausted.id
      and state = 'processing' and attempts >= 5 and lease_until < clock_timestamp();
    if not found then continue; end if;
    if exhausted.kind = 'seal' then
      update projects set freeze_error = 'Mühürleme zaman aşımına uğradı. Yönetici yeniden deneyebilir.' where id = exhausted.project_id;
    else
      update projects set delivery_error = 'Teslim işlemi zaman aşımına uğradı. Tekrar teslim et.' where id = exhausted.project_id;
    end if;
  end loop;
  return query
    with due as (
      select id from delivery_jobs where (p_project is null or project_id = p_project)
        and attempts < 5 and ((state = 'queued' and next_attempt_at <= clock_timestamp())
          or (state = 'processing' and lease_until < clock_timestamp()))
      order by created_at for update skip locked limit least(greatest(p_limit, 1), 8)
    )
    update delivery_jobs j set state = 'processing', attempts = attempts + 1,
      lease_token = gen_random_uuid(), lease_until = clock_timestamp() + interval '3 minutes'
    from due where j.id = due.id returning j.*;
end $$;

create function public.retry_delivery_job(p_job uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare j delivery_jobs;
begin
  select * into j from delivery_jobs where id = p_job;
  perform id from events where id = j.event_id for share;
  perform 1 from projects where id = j.project_id for update;
  select * into j from delivery_jobs where id = p_job for update;
  if j.state <> 'failed' then return false; end if;
  if j.kind = 'submit' and public.is_locked(j.event_id) then raise exception 'LOCKED: Süre dolduktan sonra kod kabul edilemez.'; end if;
  if exists(select 1 from delivery_jobs where project_id = j.project_id and kind = j.kind and state in ('queued','processing')) then return false; end if;
  update delivery_jobs set state = 'queued', attempts = 0, error = null, lease_until = null,
    completed_at = null, next_attempt_at = clock_timestamp() where id = j.id;
  return true;
end $$;

create function public.complete_submission(p_job uuid, p_token uuid, p_path text, p_hash text, p_bytes bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare j delivery_jobs; ev events; accepted_time timestamptz;
begin
  -- Event lock precedes project/job locks in every completion path.
  select * into j from delivery_jobs where id = p_job;
  select * into ev from events where id = j.event_id for share;
  perform 1 from projects where id = j.project_id for update;
  select * into j from delivery_jobs where id = p_job for update;
  if j.kind <> 'submit' or j.state <> 'processing' or j.lease_token is distinct from p_token
    or j.lease_until <= clock_timestamp() then return false; end if;
  accepted_time := clock_timestamp();
  if ev.locked_at is not null or accepted_time >= ev.deadline then
    update delivery_jobs set state = 'failed', error = 'Süre dolmadan arşiv doğrulanamadı.',
      completed_at = accepted_time, lease_until = null where id = j.id;
    update projects set delivery_error = 'Son güncelleme kabul edilmedi: süre dolmadan arşiv doğrulanamadı.' where id = j.project_id;
    insert into project_timeline(project_id, kind, detail) values(j.project_id, 'submission_failed', 'Teslim süresi doldu.');
    return false;
  end if;
  if p_path <> 'teslim/' || j.id::text || '.zip' then raise exception 'Geçersiz arşiv yolu'; end if;
  insert into submissions(id, project_id, sha, branch, archive_path, archive_sha256, archive_bytes, accepted_at)
    values(j.id, j.project_id, j.sha, j.branch, p_path, p_hash, p_bytes, accepted_time);
  update projects set accepted_submission_id = j.id, accepted_sha = j.sha, accepted_at = accepted_time,
    accepted_branch = j.branch, accepted_archive_path = p_path, accepted_archive_sha256 = p_hash,
    accepted_archive_bytes = p_bytes, delivery_error = null where id = j.project_id;
  update delivery_jobs set state = 'completed', completed_at = accepted_time, lease_until = null, error = null where id = j.id;
  insert into project_timeline(project_id, kind, detail) values(j.project_id, 'accepted', j.sha);
  return true;
end $$;

create function public.enqueue_seals(p_event uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform id from events where id = p_event for share;
  if not public.is_locked(p_event) then raise exception 'Teslim henüz açık.'; end if;
  insert into delivery_jobs(project_id, event_id, kind)
    select id, event_id, 'seal' from projects p where p.event_id = p_event and p.archive_sha256 is null
      and not exists(select 1 from delivery_jobs j where j.project_id = p.id and j.kind = 'seal')
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.complete_seal(p_job uuid, p_token uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare j delivery_jobs; p projects; ev events; sealed_time timestamptz;
begin
  select * into j from delivery_jobs where id = p_job;
  select * into ev from events where id = j.event_id for share;
  select * into p from projects where id = j.project_id for update;
  select * into j from delivery_jobs where id = p_job for update;
  if j.kind <> 'seal' or j.state <> 'processing' or j.lease_token is distinct from p_token
    or j.lease_until <= clock_timestamp() then return false; end if;
  sealed_time := least(ev.deadline, coalesce(ev.locked_at, ev.deadline));
  if not public.is_locked(ev.id) then raise exception 'Teslim henüz açık.'; end if;
  if p.archive_sha256 is null then
    if p.accepted_sha is null or p.accepted_at >= sealed_time then
      raise exception 'Süre dolmadan kabul edilmiş teslim sürümü yok. Sonradan kod kabul edilemez.';
    end if;
    if p.frozen_sha is not null and p.frozen_sha <> p.accepted_sha then
      raise exception 'Eski mühür ile kabul edilmiş sürüm farklı; yönetici incelemesi gerekli.';
    end if;
    update projects set frozen_sha = p.accepted_sha, frozen_at = sealed_time, frozen_method = 'accepted',
      archive_path = p.accepted_archive_path, archive_sha256 = p.accepted_archive_sha256,
      archive_bytes = p.accepted_archive_bytes, freeze_error = null where id = p.id;
    insert into project_timeline(project_id, kind, detail) values(p.id, 'sealed', p.accepted_sha);
  end if;
  update delivery_jobs set state = 'completed', completed_at = clock_timestamp(), lease_until = null, error = null where id = j.id;
  return true;
end $$;

create function public.fail_delivery_job(p_job uuid, p_token uuid, p_error text, p_retry boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare j delivery_jobs;
begin
  select * into j from delivery_jobs where id = p_job;
  perform id from events where id = j.event_id for share;
  perform 1 from projects where id = j.project_id for update;
  select * into j from delivery_jobs where id = p_job for update;
  if j.state <> 'processing' or j.lease_token is distinct from p_token then return false; end if;
  update delivery_jobs set state = case when p_retry and attempts < 5 then 'queued' else 'failed' end,
    next_attempt_at = clock_timestamp() + make_interval(secs => least(600, 30 * (2 ^ j.attempts)::integer)),
    error = left(p_error, 500), lease_until = null, completed_at = case when not p_retry or attempts >= 5 then clock_timestamp() end
    where id = j.id;
  if j.kind = 'seal' then
    update projects set freeze_error = left(p_error, 500) where id = j.project_id;
  else
    update projects set delivery_error = left(p_error, 500) where id = j.project_id;
  end if;
  insert into project_timeline(project_id, kind, detail)
    values(j.project_id, case when j.kind = 'seal' then 'seal_failed' else 'submission_failed' end, left(p_error, 500));
  return true;
end $$;

create function public.transfer_project_owner(p_project uuid, p_owner uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ev uuid;
begin
  select event_id into ev from projects where id = p_project;
  perform id from events where id = ev for share;
  perform 1 from projects where id = p_project for update;
  if public.is_locked(ev) then raise exception 'LOCKED: Ekip değiştirilemez.'; end if;
  if p_owner = p_target or not exists(select 1 from project_members where project_id = p_project and user_id = p_owner and role = 'owner')
    or not exists(select 1 from project_members where project_id = p_project and user_id = p_target and role = 'member') then
    raise exception 'Geçersiz kurucu devri.';
  end if;
  update project_members set role = 'member' where project_id = p_project and user_id = p_owner;
  update project_members set role = 'owner' where project_id = p_project and user_id = p_target;
  update projects set created_by = p_target where id = p_project;
  insert into project_timeline(project_id, kind) values(p_project, 'owner_transferred');
end $$;
create unique index project_one_owner on public.project_members(project_id) where role = 'owner';

create function public.switch_event(p_current uuid, p_title text, p_slug text, p_starts timestamptz, p_deadline timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('muhur-current-event'));
  perform id from events where id = p_current and is_current for update;
  if not found or not public.is_locked(p_current) then raise exception 'LOCKED: Güncel etkinlik henüz kilitlenmedi.'; end if;
  if p_deadline <= clock_timestamp() then raise exception 'Son teslim gelecekte olmalı.'; end if;
  -- Tamamlanmamış işler yeni etkinlik açılınca kaybolmaz; cron bütün etkinlikleri işler.
  insert into events(title, slug, starts_at, deadline) values(p_title, p_slug, p_starts, p_deadline) returning id into new_id;
  update events set is_current = false where id = p_current;
  update events set is_current = true where id = new_id;
  return new_id;
end $$;

create function public.guard_award() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from projects where id = new.project_id and event_id = new.event_id and archive_sha256 is not null)
    or not public.is_locked(new.event_id) then raise exception 'Ödül yalnızca bu etkinliğin mühürlü eserine verilebilir.'; end if;
  return new;
end $$;
create trigger awards_guard before insert or update on public.awards for each row execute function public.guard_award();

alter table public.submissions enable row level security;
alter table public.delivery_jobs enable row level security;
alter table public.project_timeline enable row level security;
alter table public.worker_runs enable row level security;
alter table public.event_reminders enable row level security;
alter table public.awards enable row level security;
revoke all on public.submissions, public.delivery_jobs, public.project_timeline, public.worker_runs,
  public.event_reminders, public.awards from anon, authenticated;
revoke execute on function public.guard_delivery_fields(), public.guard_award(), public.lock_event_for_write(), public.guard_submission_record(),
  public.lock_delivery_event(uuid, text, boolean), public.retry_delivery_job(uuid),
  public.register_project(uuid, uuid, text, text, text, text, text, bigint, text, text, text, text, text),
  public.enqueue_submission(uuid, uuid, text, text, text), public.claim_delivery_jobs(uuid, integer),
  public.complete_submission(uuid, uuid, text, text, bigint), public.enqueue_seals(uuid),
  public.complete_seal(uuid, uuid), public.fail_delivery_job(uuid, uuid, text, boolean),
  public.transfer_project_owner(uuid, uuid, uuid), public.switch_event(uuid, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.register_project(uuid, uuid, text, text, text, text, text, bigint, text, text, text, text, text),
  public.lock_delivery_event(uuid, text, boolean), public.retry_delivery_job(uuid),
  public.enqueue_submission(uuid, uuid, text, text, text), public.claim_delivery_jobs(uuid, integer),
  public.complete_submission(uuid, uuid, text, text, bigint), public.enqueue_seals(uuid),
  public.complete_seal(uuid, uuid), public.fail_delivery_job(uuid, uuid, text, boolean),
  public.transfer_project_owner(uuid, uuid, uuid), public.switch_event(uuid, text, text, timestamptz, timestamptz)
  to service_role;

grant all on public.submissions, public.delivery_jobs, public.project_timeline, public.worker_runs,
  public.event_reminders, public.awards to service_role;

commit;
