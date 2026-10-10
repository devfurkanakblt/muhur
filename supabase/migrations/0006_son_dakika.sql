-- Son dakika teslimleri: geçici bir hata, ekibin daha yeni sürümünü teslim etmesini engellemez.
-- 0005'ten sonra uygulanır, geriye uyumludur: önce migration, sonra `npm run check:schema`, ardından uygulama yayını.
begin;

-- Teslim isteği: işlenmekte olan iş yoksa bekleyen eski sürüm yerini yeni sürüme bırakır;
-- aynı sürüm yeniden istenirse bekleme süresi atlanır ve hemen denenir.
create or replace function public.enqueue_submission(p_project uuid, p_user uuid, p_sha text, p_branch text, p_repo_name text)
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

  -- Çalışanın aynı anda aldığı iş beklenir: kilit sonrası durum yeniden okunur.
  select * into active from delivery_jobs where project_id = p_project and kind = 'submit'
    and state in ('queued', 'processing') for update;
  if found and active.state = 'processing' and active.lease_until > clock_timestamp() then
    return jsonb_build_object('status', case when active.sha = p_sha then 'queued' else 'busy' end,
      'requestedSha', p_sha, 'queuedSha', active.sha, 'acceptedSha', p.accepted_sha, 'jobId', active.id);
  end if;
  if found and active.sha = p_sha then
    update delivery_jobs set next_attempt_at = clock_timestamp() where id = active.id and state = 'queued';
    return jsonb_build_object('status', 'queued', 'requestedSha', p_sha, 'queuedSha', p_sha,
      'acceptedSha', p.accepted_sha, 'jobId', active.id);
  end if;

  -- Proje başına 10 dakikada en fazla 6 yeni teslim işi. Kota dolduysa bekleyen iş olduğu gibi kalır.
  select count(*), min(created_at) into recent, oldest from delivery_jobs
    where project_id = p_project and kind = 'submit' and created_at > clock_timestamp() - interval '10 minutes';
  if recent >= 6 then
    return jsonb_build_object('status', 'rate_limited', 'requestedSha', p_sha, 'queuedSha', active.sha,
      'acceptedSha', p.accepted_sha, 'retryAt', oldest + interval '10 minutes');
  end if;

  -- Bekleyen işin aynı yola yazılmış kopyası yeni sürüm sayılmasın diye yeni sürüm yeni iş olarak açılır.
  if active.id is not null then
    update delivery_jobs set state = 'failed', error = 'Yerini daha yeni sürüme bıraktı.',
      lease_until = null, completed_at = clock_timestamp() where id = active.id;
    insert into project_timeline(project_id, kind, detail, actor_id) values(p.id, 'submission_superseded', active.sha, p_user);
  end if;
  insert into delivery_jobs(project_id, event_id, kind, sha, branch, repo_full_name)
    values(p.id, p.event_id, 'submit', p_sha, p_branch, p_repo_name) returning id into job_id;
  update projects set delivery_error = null where id = p.id;
  insert into project_timeline(project_id, kind, detail, actor_id) values(p.id, 'submission_requested', p_sha, p_user);
  return jsonb_build_object('status', 'queued', 'requestedSha', p_sha, 'queuedSha', p_sha,
    'acceptedSha', p.accepted_sha, 'jobId', job_id, 'supersededSha', active.sha);
end $$;

-- Geri çekilme: son 15 dakikada teslim işi en fazla 10 sn, mühür işi en fazla 60 sn bekler.
create or replace function public.fail_delivery_job(p_job uuid, p_token uuid, p_error text, p_retry boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare j delivery_jobs; ev events; delay integer;
begin
  select * into j from delivery_jobs where id = p_job;
  if not found then return false; end if;
  select * into ev from events where id = j.event_id for share;
  perform 1 from projects where id = j.project_id for update;
  if not found then return false; end if;
  select * into j from delivery_jobs where id = p_job for update;
  if not found or j.state <> 'processing' or j.lease_token is distinct from p_token then return false; end if;
  delay := least(600, 30 * (2 ^ j.attempts)::integer);
  if j.kind = 'seal' then delay := least(delay, 60);
  elsif ev.deadline - clock_timestamp() < interval '15 minutes' then delay := least(delay, 10);
  end if;
  update delivery_jobs set state = case when p_retry and attempts < 5 then 'queued' else 'failed' end,
    next_attempt_at = clock_timestamp() + make_interval(secs => delay),
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

-- `npm run check:schema` bu migration'ın uygulandığını buradan anlar.
create function public.delivery_schema_version() returns integer
language sql immutable security definer set search_path = public as $$ select 6 $$;
revoke execute on function public.delivery_schema_version() from public, anon, authenticated;
grant execute on function public.delivery_schema_version() to service_role;

commit;
