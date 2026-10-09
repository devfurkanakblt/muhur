-- Denetim düzeltmeleri (2026-10-04): atomik ekip işlemleri, teslim idempotency ve kotası,
-- oylama kilidi ve DB toplamları, kuyruk önceliği, aktörlü yönetim kaydı, anonimleştirme.
-- Kilit sırası her yolda: event (FOR SHARE/UPDATE) -> project (FOR UPDATE) -> membership/job.
begin;

-- Aktörlü kayıtlar ---------------------------------------------------------------------

alter table public.project_timeline add column actor_id uuid;
alter table public.worker_runs add column details jsonb not null default '{}'::jsonb;
alter table public.submissions add column archive_pruned_at timestamptz;

create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_login text not null,
  action text not null,
  event_id uuid references public.events(id),
  project_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  occurred_at timestamptz not null default clock_timestamp()
);
create index admin_audit_time on public.admin_audit(occurred_at desc);

-- Denetim kaydı yalnızca eklenir.
create function public.guard_admin_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Denetim kaydı değiştirilemez.';
end $$;
create trigger admin_audit_append_only before update or delete on public.admin_audit
for each row execute function public.guard_admin_audit();

create function public.log_admin(p_actor uuid, p_login text, p_action text, p_event uuid default null,
  p_project uuid default null, p_before jsonb default null, p_after jsonb default null, p_reason text default null)
returns void language sql security definer set search_path = public as $$
  insert into admin_audit(actor_id, actor_login, action, event_id, project_id, before, after, reason)
  values(p_actor, coalesce(p_login, '?'), p_action, p_event, p_project, p_before, p_after, left(p_reason, 500));
$$;

-- Ardışık cron çağrılarında yardımcı işlerin üst üste binmesini önleyen kira.
create table public.worker_leases (
  name text primary key,
  lease_until timestamptz not null
);
create function public.try_worker_lease(p_name text, p_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into worker_leases(name, lease_until) values(p_name, clock_timestamp() + make_interval(secs => p_seconds))
  on conflict (name) do update set lease_until = excluded.lease_until
    where worker_leases.lease_until < clock_timestamp();
  return found;
end $$;

-- A03/A04 · Ekip işlemleri: yetki, kilit ve yazma aynı transaction içinde ----------------

create function public.update_project(p_project uuid, p_actor uuid, p_name text, p_team text, p_summary text,
  p_demo text, p_logo text default null, p_replace_logo boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare ev uuid; p projects;
begin
  select event_id into ev from projects where id = p_project;
  if ev is null then raise exception 'TEAM: Kayıtlı bir projen yok.'; end if;
  perform id from events where id = ev for share;
  select * into p from projects where id = p_project for update;
  if not found then raise exception 'TEAM: Kayıtlı bir projen yok.'; end if;
  if public.is_locked(ev) then raise exception 'LOCKED: Teslim kapalı.'; end if;
  if not exists(select 1 from project_members where project_id = p_project and user_id = p_actor) then
    raise exception 'TEAM: Bu projenin ekibinde değilsin.';
  end if;
  update projects set name = p_name, team_name = p_team, summary = p_summary, demo_url = p_demo,
    logo_path = case when p_replace_logo then p_logo else logo_path end
  where id = p_project;
  insert into project_timeline(project_id, kind, actor_id) values(p_project, 'updated', p_actor);
  return case when p_replace_logo then p.logo_path end;
end $$;

-- Kurucu kontrolü silme anında yapılır; depodan silinecek yollar döner.
create function public.withdraw_project(p_project uuid, p_actor uuid, p_confirmation text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev uuid; p projects; paths text[];
begin
  select event_id into ev from projects where id = p_project;
  if ev is null then raise exception 'TEAM: Kayıtlı bir projen yok.'; end if;
  perform id from events where id = ev for share;
  select * into p from projects where id = p_project for update;
  if not found then raise exception 'TEAM: Kayıtlı bir projen yok.'; end if;
  if public.is_locked(ev) then raise exception 'LOCKED: Teslim kapalı.'; end if;
  if not exists(select 1 from project_members where project_id = p_project and user_id = p_actor and role = 'owner') then
    raise exception 'TEAM: Projeyi yalnızca kurucu geri çekebilir.';
  end if;
  if p.name is distinct from btrim(p_confirmation) then
    raise exception 'TEAM: Geri çekmek için proje adını aynen yaz.';
  end if;
  select coalesce(array_agg(distinct path), '{}') into paths from (
    select archive_path as path from snapshots where project_id = p_project
    union select archive_path from submissions where project_id = p_project
    union select 'teslim/' || id::text || '.zip' from delivery_jobs where project_id = p_project and kind = 'submit'
  ) s where path is not null;
  delete from projects where id = p_project;
  return jsonb_build_object('archives', to_jsonb(paths), 'logo', p.logo_path);
end $$;

create function public.remove_member(p_project uuid, p_actor uuid, p_target uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare ev uuid;
begin
  select event_id into ev from projects where id = p_project;
  if ev is null then return false; end if;
  perform id from events where id = ev for share;
  perform 1 from projects where id = p_project for update;
  if not found then return false; end if;
  if public.is_locked(ev) then raise exception 'LOCKED: Teslim kapalı.'; end if;
  if not exists(select 1 from project_members where project_id = p_project and user_id = p_actor and role = 'owner') then
    raise exception 'TEAM: Bu işlemi yalnızca kurucu yapabilir.';
  end if;
  delete from project_members where project_id = p_project and user_id = p_target and role = 'member';
  if not found then return false; end if;
  insert into project_timeline(project_id, kind, actor_id) values(p_project, 'member_removed', p_actor);
  return true;
end $$;

-- Yeni kod uygulamada üretilir (pgcrypto şeması ortamlar arasında farklı).
create function public.renew_invite(p_project uuid, p_actor uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare ev uuid;
begin
  if p_code !~ '^[a-f0-9]{18}$' then raise exception 'Geçersiz davet kodu.'; end if;
  select event_id into ev from projects where id = p_project;
  if ev is null then raise exception 'TEAM: Kayıtlı bir projen yok.'; end if;
  perform id from events where id = ev for share;
  perform 1 from projects where id = p_project for update;
  if public.is_locked(ev) then raise exception 'LOCKED: Teslim kapalı.'; end if;
  if not exists(select 1 from project_members where project_id = p_project and user_id = p_actor and role = 'owner') then
    raise exception 'TEAM: Bu işlemi yalnızca kurucu yapabilir.';
  end if;
  update projects set invite_code = p_code where id = p_project;
  insert into project_timeline(project_id, kind, actor_id) values(p_project, 'invite_renewed', p_actor);
end $$;

-- Kod, etkinlik ve üyelik aynı kilit altında denetlenir; yenilenen kod bekleyen katılımı da durdurur.
create function public.join_project_by_code(p_code text, p_user uuid, p_login text, p_avatar text)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; ev uuid;
begin
  if p_code is null or p_code !~ '^[a-f0-9]{18}$' then
    raise exception 'TEAM: Davet bağlantısı geçersiz ya da yenilenmiş.';
  end if;
  select id, event_id into pid, ev from projects where invite_code = p_code;
  if pid is null then raise exception 'TEAM: Davet bağlantısı geçersiz ya da yenilenmiş.'; end if;
  perform id from events where id = ev and is_current for share;
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

create function public.leave_project(p_event uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select project_id into pid from project_members where event_id = p_event and user_id = p_user;
  if pid is null then return false; end if;
  perform id from events where id = p_event for share;
  perform 1 from projects where id = pid for update;
  if public.is_locked(p_event) then raise exception 'LOCKED: Teslim kapalı.'; end if;
  delete from project_members where project_id = pid and user_id = p_user and role = 'member';
  if not found then return false; end if;
  insert into project_timeline(project_id, kind, actor_id) values(pid, 'member_left', p_user);
  return true;
end $$;

create or replace function public.transfer_project_owner(p_project uuid, p_owner uuid, p_target uuid)
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
  insert into project_timeline(project_id, kind, actor_id) values(p_project, 'owner_transferred', p_owner);
end $$;

-- A05/A08 · Teslim isteği: idempotent, kotalı ve SHA'ları açıkça bildiren yanıt ------------

drop function public.enqueue_submission(uuid, uuid, text, text, text);
create function public.enqueue_submission(p_project uuid, p_user uuid, p_sha text, p_branch text, p_repo_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev uuid; p projects; active delivery_jobs; recent integer; oldest timestamptz; job_id uuid;
begin
  if p_sha is null or p_sha !~ '^[a-f0-9]{40}$' then raise exception 'Geçersiz commit'; end if;
  select event_id into ev from projects where id = p_project;
  if ev is null then raise exception 'TEAM: Kayıtlı bir projen yok.'; end if;
  perform id from events where id = ev for share;
  if public.is_locked(ev) then raise exception 'LOCKED: Teslim kapalı.'; end if;
  select * into p from projects where id = p_project for update;
  if not exists(select 1 from project_members where project_id = p_project and user_id = p_user) then
    raise exception 'TEAM: Bu projenin ekibinde değilsin.';
  end if;

  -- Aynı commit zaten kabul edildiyse yeniden arşivlenmez.
  if p.accepted_sha = p_sha then
    update projects set delivery_error = null where id = p_project and delivery_error is not null;
    return jsonb_build_object('status', 'already_accepted', 'requestedSha', p_sha,
      'queuedSha', null, 'acceptedSha', p.accepted_sha, 'jobId', p.accepted_submission_id);
  end if;

  select * into active from delivery_jobs where project_id = p_project and kind = 'submit'
    and state in ('queued', 'processing');
  if found then
    return jsonb_build_object('status', case when active.sha = p_sha then 'queued' else 'busy' end,
      'requestedSha', p_sha, 'queuedSha', active.sha, 'acceptedSha', p.accepted_sha, 'jobId', active.id);
  end if;

  -- Proje başına 10 dakikada en fazla 6 yeni teslim işi.
  select count(*), min(created_at) into recent, oldest from delivery_jobs
    where project_id = p_project and kind = 'submit' and created_at > clock_timestamp() - interval '10 minutes';
  if recent >= 6 then
    return jsonb_build_object('status', 'rate_limited', 'requestedSha', p_sha, 'queuedSha', null,
      'acceptedSha', p.accepted_sha, 'retryAt', oldest + interval '10 minutes');
  end if;

  insert into delivery_jobs(project_id, event_id, kind, sha, branch, repo_full_name)
    values(p.id, p.event_id, 'submit', p_sha, p_branch, p_repo_name) returning id into job_id;
  update projects set delivery_error = null where id = p.id;
  insert into project_timeline(project_id, kind, detail, actor_id) values(p.id, 'submission_requested', p_sha, p_user);
  return jsonb_build_object('status', 'queued', 'requestedSha', p_sha, 'queuedSha', p_sha,
    'acceptedSha', p.accepted_sha, 'jobId', job_id);
end $$;

-- Eski kabul arşivlerinden en yeni üçü tutulur; güncel kabul ve mühür hiçbir zaman budanmaz.
-- Kayıt (SHA, hash, zaman) kanıt olarak kalır; yalnızca dosya silinmek üzere işaretlenir.
create or replace function public.guard_submission_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev uuid; p projects;
begin
  select * into p from projects where id = old.project_id;
  ev := p.event_id;
  if tg_op = 'UPDATE' then
    if old.archive_pruned_at is null and new.archive_pruned_at is not null
      and (new.id, new.project_id, new.sha, new.branch, new.archive_path, new.archive_sha256, new.archive_bytes, new.accepted_at)
        is not distinct from
        (old.id, old.project_id, old.sha, old.branch, old.archive_path, old.archive_sha256, old.archive_bytes, old.accepted_at)
      and ev is not null and not public.is_locked(ev)
      and old.archive_path is distinct from p.accepted_archive_path
      and old.archive_path is distinct from p.archive_path then
      return new;
    end if;
    raise exception 'LOCKED: Kabul edilmiş arşiv kaydı değiştirilemez.';
  end if;
  if ev is not null and public.is_locked(ev) then raise exception 'LOCKED: Kabul edilmiş arşiv silinemez.'; end if;
  return old;
end $$;

create function public.prune_submission_archives(p_project uuid, p_keep integer default 3)
returns setof text language plpgsql security definer set search_path = public as $$
declare ev uuid; p projects;
begin
  select event_id into ev from projects where id = p_project;
  if ev is null then return; end if;
  perform id from events where id = ev for share;
  select * into p from projects where id = p_project for update;
  if not found or public.is_locked(ev) then return; end if;
  return query
    update submissions s set archive_pruned_at = clock_timestamp()
    where s.id in (
      select id from submissions where project_id = p_project and archive_pruned_at is null
        and archive_path is distinct from p.accepted_archive_path and archive_path is distinct from p.archive_path
      order by accepted_at desc offset greatest(p_keep, 0)
    )
    returning s.archive_path;
end $$;

-- Proje silindiyse veya kira kaybedildiyse çalışan iş depoya yazmaz.
create function public.delivery_job_state(p_job uuid, p_token uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare j delivery_jobs;
begin
  select * into j from delivery_jobs where id = p_job;
  if not found or j.state <> 'processing' or j.lease_token is distinct from p_token
    or j.lease_until <= clock_timestamp() then return 'gone'; end if;
  if j.kind = 'submit' and public.is_locked(j.event_id) then return 'locked'; end if;
  return 'ok';
end $$;

create or replace function public.complete_submission(p_job uuid, p_token uuid, p_path text, p_hash text, p_bytes bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare j delivery_jobs; ev events; accepted_time timestamptz;
begin
  select * into j from delivery_jobs where id = p_job;
  if not found then return false; end if;
  select * into ev from events where id = j.event_id for share;
  perform 1 from projects where id = j.project_id for update;
  if not found then return false; end if;
  select * into j from delivery_jobs where id = p_job for update;
  if not found or j.kind <> 'submit' or j.state <> 'processing' or j.lease_token is distinct from p_token
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

create or replace function public.fail_delivery_job(p_job uuid, p_token uuid, p_error text, p_retry boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare j delivery_jobs;
begin
  select * into j from delivery_jobs where id = p_job;
  if not found then return false; end if;
  perform id from events where id = j.event_id for share;
  perform 1 from projects where id = j.project_id for update;
  if not found then return false; end if;
  select * into j from delivery_jobs where id = p_job for update;
  if not found or j.state <> 'processing' or j.lease_token is distinct from p_token then return false; end if;
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

-- A12 · Kilitli etkinliğin bekleyen teslim işleri indirilmeden kapatılır; mühür işleri önce alınır.
create or replace function public.claim_delivery_jobs(p_project uuid default null, p_limit integer default 4)
returns setof public.delivery_jobs language plpgsql security definer set search_path = public as $$
declare exhausted delivery_jobs; late delivery_jobs;
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

  for late in select j.* from delivery_jobs j join events e on e.id = j.event_id
    where j.kind = 'submit' and (p_project is null or j.project_id = p_project)
      and (j.state = 'queued' or (j.state = 'processing' and j.lease_until < clock_timestamp()))
      and (e.locked_at is not null or clock_timestamp() >= e.deadline)
    order by j.created_at limit 50 loop
    perform id from events where id = late.event_id for share;
    perform 1 from projects where id = late.project_id for update skip locked;
    if not found then continue; end if;
    update delivery_jobs set state = 'failed', error = 'Teslim süresi doldu; iş işlenmeden kapatıldı.',
      lease_until = null, completed_at = clock_timestamp()
      where id = late.id and state in ('queued', 'processing')
        and (state = 'queued' or lease_until < clock_timestamp());
    if not found then continue; end if;
    update projects set delivery_error = 'Son güncelleme kabul edilmedi: süre dolmadan arşiv doğrulanamadı.' where id = late.project_id;
    insert into project_timeline(project_id, kind, detail) values(late.project_id, 'submission_failed', 'Teslim süresi doldu.');
  end loop;

  return query
    with due as (
      select j.id from delivery_jobs j where (p_project is null or j.project_id = p_project)
        and j.attempts < 5 and ((j.state = 'queued' and j.next_attempt_at <= clock_timestamp())
          or (j.state = 'processing' and j.lease_until < clock_timestamp()))
        and (j.kind = 'seal' or not public.is_locked(j.event_id))
      order by (j.kind = 'seal') desc, j.created_at
      for update skip locked limit least(greatest(p_limit, 1), 8)
    )
    update delivery_jobs j set state = 'processing', attempts = attempts + 1,
      lease_token = gen_random_uuid(), lease_until = clock_timestamp() + interval '3 minutes'
    from due where j.id = due.id returning j.*;
end $$;

-- A06/A07/A17 · Oylama ---------------------------------------------------------------------
-- Oy yazımı event satırını FOR SHARE kilitler; sonuçlandırma UPDATE'i bekleyen oyları bekler,
-- ardından gelen oy güncel durumu ('sonuclandi') görüp reddedilir. Aday yalnızca mühürlü eserdir.
create or replace function public.guard_votes() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev uuid; state text;
begin
  ev := coalesce(new.event_id, old.event_id);
  if tg_op = 'UPDATE' and current_setting('muhur.anonymize', true) = 'on'
    and (new.event_id, new.user_id, new.project_id, new.voted_at)
      is not distinct from (old.event_id, old.user_id, old.project_id, old.voted_at) then
    return new;
  end if;
  select voting into state from events where id = ev for share;
  if state is distinct from 'acik' then
    raise exception 'VOTING: Oylama açık değil.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if not exists (select 1 from projects where id = new.project_id and event_id = ev) then
    raise exception 'VOTING: Eser bu etkinliğe ait değil.';
  end if;
  if not exists (select 1 from projects where id = new.project_id and archive_sha256 is not null) then
    raise exception 'VOTING: Yalnızca mühürlü eserlere oy verilebilir.';
  end if;
  if exists (select 1 from project_members where project_id = new.project_id and user_id = new.user_id) then
    raise exception 'VOTING: Kendi ekibine oy veremezsin.';
  end if;
  new.voted_at := now();
  return new;
end $$;

-- Toplamlar DB'de sayılır ve tek değer döner (API satır sınırından etkilenmez).
create function public.vote_tallies(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(t.project_id, t.n), '{}'::jsonb)
  from (
    select v.project_id, count(*) as n from votes v
    join events e on e.id = v.event_id and e.voting = 'sonuclandi'
    join projects p on p.id = v.project_id and p.archive_sha256 is not null
    where v.event_id = p_event group by v.project_id
  ) t
$$;

-- A20 · Yönetim işlemleri aktör kaydıyla aynı transaction içinde ---------------------------

create function public.admin_update_event(p_event uuid, p_actor uuid, p_login text, p_action text, p_changes jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare b events; a events;
begin
  if exists(select 1 from jsonb_object_keys(p_changes) k where k not in ('starts_at', 'deadline', 'announcement', 'voting')) then
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
    voting = case when p_changes ? 'voting' then p_changes->>'voting' else voting end
  where id = p_event returning * into a;
  perform public.log_admin(p_actor, p_login, p_action, p_event, null,
    jsonb_build_object('starts_at', b.starts_at, 'deadline', b.deadline, 'announcement', b.announcement, 'voting', b.voting),
    jsonb_build_object('starts_at', a.starts_at, 'deadline', a.deadline, 'announcement', a.announcement, 'voting', a.voting));
end $$;

create function public.admin_lock_event(p_event uuid, p_actor uuid, p_login text)
returns boolean language plpgsql security definer set search_path = public as $$
declare was timestamptz; ok boolean; now_locked timestamptz;
begin
  select locked_at into was from events where id = p_event for update;
  if not found then raise exception 'Etkinlik bulunamadı.'; end if;
  ok :=public.lock_delivery_event(p_event, p_login, true);
  select locked_at into now_locked from events where id = p_event;
  if was is null then
    perform public.log_admin(p_actor, p_login, 'lock_now', p_event, null, null, jsonb_build_object('locked_at', now_locked));
  end if;
  return ok;
end $$;

create function public.admin_switch_event(p_current uuid, p_title text, p_slug text, p_starts timestamptz,
  p_deadline timestamptz, p_actor uuid, p_login text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  new_id := public.switch_event(p_current, p_title, p_slug, p_starts, p_deadline);
  perform public.log_admin(p_actor, p_login, 'switch_event', new_id, null, jsonb_build_object('current', p_current),
    jsonb_build_object('title', p_title, 'slug', p_slug, 'starts_at', p_starts, 'deadline', p_deadline));
  return new_id;
end $$;

create function public.admin_add_award(p_event uuid, p_project uuid, p_title text, p_reason text, p_actor uuid, p_login text)
returns uuid language plpgsql security definer set search_path = public as $$
declare award_id uuid;
begin
  insert into awards(event_id, project_id, title, reason) values(p_event, p_project, p_title, p_reason) returning id into award_id;
  perform public.log_admin(p_actor, p_login, 'award_added', p_event, p_project, null,
    jsonb_build_object('award', award_id, 'title', p_title, 'reason', p_reason));
  return award_id;
end $$;

create function public.admin_remove_award(p_award uuid, p_event uuid, p_actor uuid, p_login text)
returns boolean language plpgsql security definer set search_path = public as $$
declare a awards;
begin
  delete from awards where id = p_award and event_id = p_event returning * into a;
  if not found then return false; end if;
  perform public.log_admin(p_actor, p_login, 'award_removed', p_event, a.project_id,
    jsonb_build_object('award', a.id, 'title', a.title, 'reason', a.reason), null);
  return true;
end $$;

-- A19 · Anonimleştirme: teslim hash'i, SHA ve zamanlar korunur; kişisel görünüm kaldırılır --------
-- Kilitli etkinliklerde üyelik ve oy satırları yalnızca bu işlem içinde, yalnızca ad/avatar için değişebilir.
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
    if tg_op = 'UPDATE' and current_setting('muhur.anonymize', true) = 'on'
      and (new.project_id, new.event_id, new.user_id, new.role, new.joined_at)
        is not distinct from (old.project_id, old.event_id, old.user_id, old.role, old.joined_at) then
      return new;
    end if;
    raise exception 'LOCKED: Teslim süresi doldu, ekip değiştirilemez.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create function public.anonymize_user(p_user uuid, p_actor uuid, p_login text, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare alias text := 'anonim-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8); n integer; m integer;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'Anonimleştirme gerekçesi gerekli.'; end if;
  perform set_config('muhur.anonymize', 'on', true);
  update project_members set github_login = alias, avatar_url = null where user_id = p_user;
  get diagnostics n = row_count;
  update votes set github_login = alias where user_id = p_user;
  get diagnostics m = row_count;
  perform set_config('muhur.anonymize', 'off', true);
  perform public.log_admin(p_actor, p_login, 'anonymize_user', null, null, jsonb_build_object('user', p_user),
    jsonb_build_object('alias', alias, 'memberships', n, 'votes', m), p_reason);
  return n + m;
end $$;

-- Erişim -----------------------------------------------------------------------------------

alter table public.admin_audit enable row level security;
alter table public.worker_leases enable row level security;
revoke all on public.admin_audit, public.worker_leases from anon, authenticated;
grant select, insert on public.admin_audit to service_role;
grant all on public.worker_leases to service_role;

revoke execute on function
  public.guard_admin_audit(), public.log_admin(uuid, text, text, uuid, uuid, jsonb, jsonb, text),
  public.try_worker_lease(text, integer),
  public.update_project(uuid, uuid, text, text, text, text, text, boolean),
  public.withdraw_project(uuid, uuid, text), public.remove_member(uuid, uuid, uuid),
  public.renew_invite(uuid, uuid, text), public.join_project_by_code(text, uuid, text, text),
  public.leave_project(uuid, uuid), public.transfer_project_owner(uuid, uuid, uuid),
  public.enqueue_submission(uuid, uuid, text, text, text),
  public.guard_submission_record(), public.prune_submission_archives(uuid, integer),
  public.delivery_job_state(uuid, uuid), public.complete_submission(uuid, uuid, text, text, bigint),
  public.fail_delivery_job(uuid, uuid, text, boolean), public.claim_delivery_jobs(uuid, integer),
  public.guard_votes(), public.vote_tallies(uuid), public.guard_members(),
  public.admin_update_event(uuid, uuid, text, text, jsonb), public.admin_lock_event(uuid, uuid, text),
  public.admin_switch_event(uuid, text, text, timestamptz, timestamptz, uuid, text),
  public.admin_add_award(uuid, uuid, text, text, uuid, text), public.admin_remove_award(uuid, uuid, uuid, text),
  public.anonymize_user(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function
  public.log_admin(uuid, text, text, uuid, uuid, jsonb, jsonb, text), public.try_worker_lease(text, integer),
  public.update_project(uuid, uuid, text, text, text, text, text, boolean),
  public.withdraw_project(uuid, uuid, text), public.remove_member(uuid, uuid, uuid),
  public.renew_invite(uuid, uuid, text), public.join_project_by_code(text, uuid, text, text),
  public.leave_project(uuid, uuid), public.transfer_project_owner(uuid, uuid, uuid),
  public.enqueue_submission(uuid, uuid, text, text, text), public.prune_submission_archives(uuid, integer),
  public.delivery_job_state(uuid, uuid), public.complete_submission(uuid, uuid, text, text, bigint),
  public.fail_delivery_job(uuid, uuid, text, boolean), public.claim_delivery_jobs(uuid, integer),
  public.vote_tallies(uuid),
  public.admin_update_event(uuid, uuid, text, text, jsonb), public.admin_lock_event(uuid, uuid, text),
  public.admin_switch_event(uuid, text, text, timestamptz, timestamptz, uuid, text),
  public.admin_add_award(uuid, uuid, text, text, uuid, text), public.admin_remove_award(uuid, uuid, uuid, text),
  public.anonymize_user(uuid, uuid, text, text)
  to service_role;

commit;
