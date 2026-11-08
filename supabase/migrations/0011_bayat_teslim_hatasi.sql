-- An old submit job must not overwrite the project's status after a newer version was accepted.
-- Seen in production: commit A (>50 MB) failed, the team pushed a smaller commit B and B was accepted.
-- Then the admin pressed "Tekrar dene" on A. A was archived again, failed again, and wrote the error
-- "50 MB sınırını aşıyor" back onto the project. The panel showed the delivery as failed even though B was accepted.
--  * fail_delivery_job / claim_delivery_jobs: when a job is older than the accepted submission, delivery_error is not touched.
--    The job's own record and the timeline entry are kept.
--  * retry_delivery_job: a submit job left behind by a newer accepted version cannot be retried.
-- The function bodies are copied from the live definitions (0006); only these guards are added.
begin;

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
    update projects set delivery_error = left(p_error, 500) where id = j.project_id
      and (accepted_at is null or accepted_at <= j.created_at);
  end if;
  insert into project_timeline(project_id, kind, detail)
    values(j.project_id, case when j.kind = 'seal' then 'seal_failed' else 'submission_failed' end, left(p_error, 500));
  return true;
end $$;

create or replace function public.claim_delivery_jobs(p_project uuid default null, p_limit integer default 4)
returns setof delivery_jobs language plpgsql security definer set search_path = public as $$
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
      update projects set delivery_error = 'Teslim işlemi zaman aşımına uğradı. Tekrar teslim et.' where id = exhausted.project_id
        and (accepted_at is null or accepted_at <= exhausted.created_at);
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
    update projects set delivery_error = 'Son güncelleme kabul edilmedi: süre dolmadan arşiv doğrulanamadı.' where id = late.project_id
      and (accepted_at is null or accepted_at <= late.created_at);
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

create or replace function public.retry_delivery_job(p_job uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare j delivery_jobs;
begin
  select * into j from delivery_jobs where id = p_job;
  perform id from events where id = j.event_id for share;
  perform 1 from projects where id = j.project_id for update;
  select * into j from delivery_jobs where id = p_job for update;
  if j.state <> 'failed' then return false; end if;
  if j.kind = 'submit' and public.is_locked(j.event_id) then raise exception 'LOCKED: Süre dolduktan sonra kod kabul edilemez.'; end if;
  if j.kind = 'submit' and exists(select 1 from projects where id = j.project_id and accepted_at > j.created_at) then
    raise exception 'TEAM: Bu işten sonra daha yeni bir sürüm kabul edildi; eski işi yeniden denemeye gerek yok.';
  end if;
  if exists(select 1 from delivery_jobs where project_id = j.project_id and kind = j.kind and state in ('queued','processing')) then return false; end if;
  update delivery_jobs set state = 'queued', attempts = 0, error = null, lease_until = null,
    completed_at = null, next_attempt_at = clock_timestamp() where id = j.id;
  return true;
end $$;

-- Stale errors already on projects: a job older than the accepted version wrote it after that version was accepted.
update projects p set delivery_error = null
where p.delivery_error is not null and p.accepted_at is not null
  and exists(select 1 from delivery_jobs j where j.project_id = p.id and j.kind = 'submit' and j.state = 'failed'
    and j.created_at < p.accepted_at and j.completed_at > p.accepted_at and j.error = p.delivery_error)
  and not exists(select 1 from delivery_jobs j where j.project_id = p.id and j.kind = 'submit'
    and j.created_at > p.accepted_at);

commit;
