-- Plan 5 · 30 günlük ZIP saklama: defter (ledger), manifest ve okuyucu altyapısı. SİLME KAPALI.
-- Additive: eski uygulama çalışmaya devam eder. Süreli silme yalnız 0021 kapısı açıldıktan ve head admin
-- taze oturumla gerekçe vererek etkinleştirdikten sonra mümkündür; bu migration hiçbir dosya silmez.
--
-- Kanıt tabloları değiştirilmez: projects/submissions/snapshots üzerindeki SHA, hash, bayt, arşiv yolu ve
-- zamanlar olduğu gibi kalır. Silinme ayrı defterde (archive_expiry_*) tutulur; archive_pruned_at'e dokunulmaz.
-- Sözleşme onay kayıtları ve denetim kaydı bu temizliğin hedefi değildir.
begin;

-- Süre kaynağı: kalıcı locked_at. Kilit geri alınamaz (guard_events); vade her yazmada yeniden hesaplanır,
-- elle değiştirilemez. Kilit yokken null.
alter table public.events add column archive_expires_at timestamptz;

create function public.set_archive_expiry() returns trigger
language plpgsql set search_path = public as $$
begin
  new.archive_expires_at := case when new.locked_at is null then null else new.locked_at + interval '720 hours' end;
  return new;
end $$;
create trigger events_archive_expiry before insert or update on public.events
for each row execute function public.set_archive_expiry();

update public.events set archive_expires_at = locked_at + interval '720 hours' where locked_at is not null;
create index events_archive_expires on public.events(archive_expires_at) where archive_expires_at is not null;

-- Okuyucuların zaman kararı DB saatine göredir: available | expiring (son 72 saat) | expired.
-- Dosya henüz silinmemiş olsa da vade dolunca yeni indirme başlatılmaz.
create function public.archive_availability(p_event uuid, p_now timestamptz default clock_timestamp())
returns text language sql stable security definer set search_path = public as $$
  select case
    when e.archive_expires_at is null then 'available'
    when p_now >= e.archive_expires_at then 'expired'
    when e.archive_expires_at - p_now <= interval '72 hours' then 'expiring'
    else 'available' end
  from events e where e.id = p_event
$$;

-- Defter --------------------------------------------------------------------------------------------
create table public.archive_expiry_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete restrict,
  expires_at timestamptz not null,
  state text not null default 'prepared' check (state in ('prepared', 'deleting', 'completed', 'failed', 'blocked')),
  manifest_hash text not null check (manifest_hash ~ '^[a-f0-9]{64}$'),
  object_count integer not null check (object_count >= 0),
  total_bytes bigint not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500)
);

create table public.archive_expiry_objects (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.archive_expiry_runs(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  bucket text not null default 'archives' check (bucket = 'archives'),
  path text not null check (path ~ '^teslim/[0-9a-f-]{36}\.zip$' or path ~ '^ara-muhur/[a-z0-9-]{3,40}/[0-9]{3,}-[0-9a-f]{7}\.zip$'),
  bytes bigint,
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  reference_summary jsonb not null,
  state text not null default 'pending' check (state in ('pending', 'processing', 'deleted', 'failed')),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null,
  deleted_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  unique (bucket, path)
);
create index archive_expiry_objects_due on public.archive_expiry_objects(next_attempt_at) where state = 'pending';
create index archive_expiry_objects_event on public.archive_expiry_objects(event_id, state);

-- Manifest ve durumlar geri alınamaz şekilde ilerler; yol, kapsam ve kanıt alanları değişmez.
create function public.guard_archive_expiry_run() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'SAKLAMA: Saklama defteri silinemez.'; end if;
  if (new.event_id, new.expires_at, new.manifest_hash, new.object_count, new.total_bytes, new.created_at)
    is distinct from (old.event_id, old.expires_at, old.manifest_hash, old.object_count, old.total_bytes, old.created_at) then
    raise exception 'SAKLAMA: Manifest kanıtı değiştirilemez.';
  end if;
  if new.state is distinct from old.state and not (
    (old.state = 'prepared' and new.state in ('deleting', 'blocked')) or
    (old.state = 'deleting' and new.state in ('completed', 'failed', 'blocked'))) then
    raise exception 'SAKLAMA: Geçersiz defter durumu geçişi (% → %).', old.state, new.state;
  end if;
  return new;
end $$;
create trigger archive_expiry_runs_guard before update or delete on public.archive_expiry_runs
for each row execute function public.guard_archive_expiry_run();

create function public.guard_archive_expiry_object() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'SAKLAMA: Saklama defteri silinemez.'; end if;
  if (new.run_id, new.event_id, new.bucket, new.path, new.bytes, new.sha256, new.reference_summary)
    is distinct from (old.run_id, old.event_id, old.bucket, old.path, old.bytes, old.sha256, old.reference_summary) then
    raise exception 'SAKLAMA: Manifest yolları değiştirilemez.';
  end if;
  if new.state is distinct from old.state and not (
    (old.state = 'pending' and new.state = 'processing') or
    (old.state = 'processing' and new.state in ('pending', 'deleted', 'failed'))) then
    raise exception 'SAKLAMA: Geçersiz nesne durumu geçişi (% → %).', old.state, new.state;
  end if;
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'SAKLAMA: Silinme zamanı değiştirilemez.';
  end if;
  return new;
end $$;
create trigger archive_expiry_objects_guard before update or delete on public.archive_expiry_objects
for each row execute function public.guard_archive_expiry_object();

-- Okuyucu penceresi: durum, vade ve kalan saniye (imzalı URL ömrü bunu aşamaz).
create function public.archive_access(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'state', archive_availability(e.id, clock_timestamp()),
    'expires_at', e.archive_expires_at,
    'seconds_left', case when e.archive_expires_at is null then null
      else greatest(0, floor(extract(epoch from (e.archive_expires_at - clock_timestamp()))))::bigint end,
    'run_state', (select state from archive_expiry_runs r where r.event_id = e.id),
    'deleted_objects', (select count(*) from archive_expiry_objects o where o.event_id = e.id and o.state = 'deleted'))
  from events e where e.id = p_event
$$;

-- Platform ayarı: varsayılan kapalı. Kapı (0021) açılmadan etkinleştirilemez; kapatmak her zaman serbest.
create table public.archive_retention_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  readers_confirmed_at timestamptz,
  readers_confirmed_by uuid,
  dry_run_summary jsonb,
  changed_by uuid,
  changed_login text,
  changed_at timestamptz,
  reason text
);
insert into public.archive_retention_settings(id, enabled) values (true, false);

create function public.archive_retention_gate_open() returns boolean
language sql stable set search_path = public as $$ select false $$;

create function public.archive_retention_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from archive_retention_settings where id), false) and archive_retention_gate_open()
$$;

-- Manifest ----------------------------------------------------------------------------------------
-- Yalnız okur (geçici tablo dışında yazmaz); geçici tablo kullandığı için volatile işaretlidir.
-- Etkinliğin bütün arşiv referansları: mühür, kabul, bütün teslim geçmişi (budanmışlar dahil), ara mühürler ve
-- teslim işi yolları. Yan etkisiz; kapsam dışı yol, başka etkinlikle paylaşılan yol, çelişkili kanıt ya da
-- başka etkinliğin defterindeki yol varsa hata verir (fail-closed): hiçbir dosya silinmeye aday olmaz.
create function public.archive_expiry_manifest(p_event uuid)
returns table(path text, bytes bigint, sha256 text, refs jsonb)
language plpgsql volatile security definer set search_path = public as $$
declare ev events; bad text;
begin
  select * into ev from events where id = p_event;
  if not found then raise exception 'SAKLAMA: Etkinlik bulunamadı.'; end if;
  if ev.locked_at is null then raise exception 'SAKLAMA: Kalıcı kilit kaydı yok; önce kilit yazılmalı.'; end if;

  create temporary table if not exists pg_temp.archive_refs(path text, bytes bigint, sha text, kind text, project uuid) on commit drop;
  truncate pg_temp.archive_refs;
  insert into pg_temp.archive_refs
    select p.archive_path, p.archive_bytes, p.archive_sha256, 'muhur', p.id from projects p where p.event_id = p_event and p.archive_path is not null
    union all select p.accepted_archive_path, p.accepted_archive_bytes, p.accepted_archive_sha256, 'kabul', p.id from projects p where p.event_id = p_event and p.accepted_archive_path is not null
    union all select s.archive_path, s.archive_bytes, s.archive_sha256, case when s.archive_pruned_at is null then 'teslim' else 'teslim-budanmis' end, s.project_id
      from submissions s join projects p on p.id = s.project_id where p.event_id = p_event
    union all select n.archive_path, n.archive_bytes, n.archive_sha256, 'ara-muhur', n.project_id
      from snapshots n join projects p on p.id = n.project_id where p.event_id = p_event
    union all select 'teslim/' || j.id::text || '.zip', null, null, 'teslim-isi', j.project_id
      from delivery_jobs j where j.event_id = p_event and j.kind = 'submit';

  select r.path into bad from pg_temp.archive_refs r
    where not (r.path ~ '^teslim/[0-9a-f-]{36}\.zip$' or (r.path ~ '^ara-muhur/[a-z0-9-]{3,40}/[0-9]{3,}-[0-9a-f]{7}\.zip$' and split_part(r.path, '/', 2) = ev.slug))
    limit 1;
  if bad is not null then raise exception 'SAKLAMA: Kapsam dışı arşiv yolu: %', bad; end if;

  select r.path into bad from pg_temp.archive_refs r group by r.path
    having count(distinct r.sha) > 1 or count(distinct r.bytes) > 1 limit 1;
  if bad is not null then raise exception 'SAKLAMA: Aynı yol için çelişkili kanıt: %', bad; end if;

  select r.path into bad from pg_temp.archive_refs r where exists (
      select 1 from projects p where p.event_id <> p_event and r.path in (p.archive_path, p.accepted_archive_path)
      union all select 1 from submissions s join projects p on p.id = s.project_id where p.event_id <> p_event and s.archive_path = r.path
      union all select 1 from snapshots n join projects p on p.id = n.project_id where p.event_id <> p_event and n.archive_path = r.path
      union all select 1 from delivery_jobs j where j.event_id <> p_event and j.kind = 'submit' and 'teslim/' || j.id::text || '.zip' = r.path
      union all select 1 from archive_expiry_objects o where o.event_id <> p_event and o.path = r.path)
    limit 1;
  if bad is not null then raise exception 'SAKLAMA: Arşiv yolu başka bir etkinlikte de kayıtlı: %', bad; end if;

  return query
    select r.path, max(r.bytes), max(r.sha),
      jsonb_agg(jsonb_build_object('kind', r.kind, 'project', r.project) order by r.kind, r.project)
    from pg_temp.archive_refs r group by r.path order by r.path collate "C";
end $$;

-- Deterministik manifest özeti: "yol\tbayt\tsha256" satırları, bayt sırasıyla (C) sıralı, LF ile birleşik.
create function public.archive_manifest_hash(p_lines text[]) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(array_to_string(p_lines, E'\n'), ''), 'UTF8')), 'hex')
$$;

create function public.archive_expiry_preview(p_event uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare lines text[]; n integer; total bigint; ev events;
begin
  select * into ev from events where id = p_event;
  select array_agg(m.path || E'\t' || coalesce(m.bytes::text, '') || E'\t' || coalesce(m.sha256, '') order by m.path collate "C"),
         count(*), coalesce(sum(m.bytes), 0)
    into lines, n, total from archive_expiry_manifest(p_event) m;
  return jsonb_build_object('event', p_event, 'slug', ev.slug, 'locked_at', ev.locked_at, 'expires_at', ev.archive_expires_at,
    'availability', archive_availability(p_event, clock_timestamp()), 'objects', n, 'bytes', total,
    'manifest_hash', archive_manifest_hash(lines), 'run', (select to_jsonb(r) - 'last_error' from archive_expiry_runs r where r.event_id = p_event));
end $$;

-- RPC sözleşmeleri --------------------------------------------------------------------------------
-- Eksiksiz referans taraması + deterministik manifest; Storage'a dokunmaz. Tekrar çağrı aynı işi döndürür.
create function public.prepare_archive_expiry(p_event uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; ev events; lines text[]; n integer; total bigint;
begin
  select * into ev from events where id = p_event for update;
  if not found then raise exception 'SAKLAMA: Etkinlik bulunamadı.'; end if;
  select id into rid from archive_expiry_runs where event_id = p_event;
  if found then return rid; end if;
  if ev.locked_at is null then raise exception 'SAKLAMA: Kalıcı kilit kaydı yok; önce kilit yazılmalı.'; end if;
  create temporary table pg_temp.archive_manifest on commit drop as select * from archive_expiry_manifest(p_event);
  select array_agg(m.path || E'\t' || coalesce(m.bytes::text, '') || E'\t' || coalesce(m.sha256, '') order by m.path collate "C"),
         count(*), coalesce(sum(m.bytes), 0)
    into lines, n, total from pg_temp.archive_manifest m;
  insert into archive_expiry_runs(event_id, expires_at, manifest_hash, object_count, total_bytes)
    values (p_event, ev.archive_expires_at, archive_manifest_hash(lines), n, total) returning id into rid;
  insert into archive_expiry_objects(run_id, event_id, path, bytes, sha256, reference_summary, next_attempt_at)
    select rid, p_event, m.path, m.bytes, m.sha256, m.refs, ev.archive_expires_at from pg_temp.archive_manifest m;
  drop table pg_temp.archive_manifest;
  perform log_admin(null, 'zamanlayıcı', 'archive_expiry_prepared', p_event, null, null,
    jsonb_build_object('run', rid, 'objects', n, 'bytes', total, 'manifest_hash', archive_manifest_hash(lines), 'expires_at', ev.archive_expires_at));
  return rid;
end $$;

-- Yalnız etkin ayarda ve vadesi gelmiş işlerde; süresi biten kiralar geri alınır. Etkinlikler arasında adil:
-- her etkinlikten sırayla. İlk claim'de manifest yeniden hesaplanır; değiştiyse iş durdurulur (blocked).
create function public.claim_archive_expiry_objects(p_limit integer default 10)
returns setof public.archive_expiry_objects
language plpgsql security definer set search_path = public as $$
declare r archive_expiry_runs; lines text[]; ids uuid[];
begin
  if not archive_retention_enabled() then return; end if;
  update archive_expiry_objects set state = 'pending', lease_token = null, lease_until = null,
    last_error = coalesce(last_error, 'Kira süresi doldu; yeniden denenecek.')
    where state = 'processing' and lease_until < clock_timestamp();
  for r in select * from archive_expiry_runs where state = 'prepared' and expires_at <= clock_timestamp() for update skip locked loop
    begin
      select array_agg(m.path || E'\t' || coalesce(m.bytes::text, '') || E'\t' || coalesce(m.sha256, '') order by m.path collate "C")
        into lines from archive_expiry_manifest(r.event_id) m;
      if archive_manifest_hash(lines) is distinct from r.manifest_hash then
        update archive_expiry_runs set state = 'blocked', last_error = 'Manifest hazırlıktan sonra değişti; silme durduruldu.' where id = r.id;
        perform log_admin(null, 'zamanlayıcı', 'archive_expiry_blocked', r.event_id, null, null, jsonb_build_object('run', r.id, 'reason', 'manifest_changed'));
      else
        update archive_expiry_runs set state = 'deleting' where id = r.id;
      end if;
    exception when others then
      update archive_expiry_runs set state = 'blocked', last_error = left(sqlerrm, 500) where id = r.id;
      perform log_admin(null, 'zamanlayıcı', 'archive_expiry_blocked', r.event_id, null, null, jsonb_build_object('run', r.id, 'reason', left(sqlerrm, 300)));
    end;
  end loop;
  select array_agg(c.id) into ids from (
    select o.id from archive_expiry_objects o join archive_expiry_runs ru on ru.id = o.run_id
    where o.state = 'pending' and o.next_attempt_at <= clock_timestamp() and ru.state = 'deleting' and ru.expires_at <= clock_timestamp()
    order by row_number() over (partition by o.event_id order by o.attempts, o.path), ru.expires_at, o.id
    limit greatest(1, least(p_limit, 50)) * 4) c;
  return query
    update archive_expiry_objects o set state = 'processing', lease_token = gen_random_uuid(),
      lease_until = clock_timestamp() + interval '5 minutes', attempts = o.attempts + 1
    where o.id in (select x.id from archive_expiry_objects x where x.id = any(coalesce(ids, '{}')) and x.state = 'pending'
      order by array_position(ids, x.id) limit greatest(1, least(p_limit, 50)) for update skip locked)
    returning o.*;
end $$;

-- Storage silmesi (ya da açık not-found) başarılı olduktan SONRA çağrılır. Eski kira tokenı reddedilir.
create function public.complete_archive_expiry_object(p_id uuid, p_token uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare o archive_expiry_objects; ru archive_expiry_runs;
begin
  select * into o from archive_expiry_objects where id = p_id for update;
  if not found or o.state <> 'processing' or o.lease_token is distinct from p_token then return false; end if;
  select * into ru from archive_expiry_runs where id = o.run_id;
  if ru.state <> 'deleting' or ru.expires_at > clock_timestamp() then
    raise exception 'SAKLAMA: Saklama süresi dolmamış ya da iş etkin değil.';
  end if;
  if o.bucket <> 'archives' then raise exception 'SAKLAMA: Kapsam dışı depo.'; end if;
  update archive_expiry_objects set state = 'deleted', deleted_at = clock_timestamp(), lease_token = null, lease_until = null, last_error = null where id = p_id;
  perform log_admin(null, 'zamanlayıcı', 'archive_object_expired', o.event_id, null, null,
    jsonb_build_object('run', o.run_id, 'path', o.path, 'sha256', o.sha256, 'bytes', o.bytes));
  return true;
end $$;

-- Sınırlı yeniden deneme: 5 denemeden sonra terminal 'failed'. İlk başarısız dosyada bütün iş bitmiş sayılmaz.
create function public.fail_archive_expiry_object(p_id uuid, p_token uuid, p_error text) returns boolean
language plpgsql security definer set search_path = public as $$
declare o archive_expiry_objects;
begin
  select * into o from archive_expiry_objects where id = p_id for update;
  if not found or o.state <> 'processing' or o.lease_token is distinct from p_token then return false; end if;
  if o.attempts >= 5 then
    update archive_expiry_objects set state = 'failed', lease_token = null, lease_until = null, last_error = left(coalesce(p_error, 'Bilinmeyen hata'), 500) where id = p_id;
  else
    update archive_expiry_objects set state = 'pending', lease_token = null, lease_until = null, last_error = left(coalesce(p_error, 'Bilinmeyen hata'), 500),
      next_attempt_at = clock_timestamp() + least(interval '60 minutes', interval '1 minute' * power(2, o.attempts)) where id = p_id;
  end if;
  return true;
end $$;

-- Bütün nesneler terminalse işi kapatır: hepsi silindiyse completed, terminal hata varsa failed. Kanıt icat etmez.
create function public.finalize_archive_expiry(p_run uuid) returns text
language plpgsql security definer set search_path = public as $$
declare ru archive_expiry_runs; open_n integer; failed_n integer; deleted_n integer;
begin
  select * into ru from archive_expiry_runs where id = p_run for update;
  if not found then raise exception 'SAKLAMA: İş bulunamadı.'; end if;
  if ru.state <> 'deleting' then return ru.state; end if;
  select count(*) filter (where state in ('pending', 'processing')), count(*) filter (where state = 'failed'), count(*) filter (where state = 'deleted')
    into open_n, failed_n, deleted_n from archive_expiry_objects where run_id = p_run;
  if open_n > 0 then return ru.state; end if;
  if failed_n > 0 then
    update archive_expiry_runs set state = 'failed', last_error = failed_n || ' dosya silinemedi.' where id = p_run;
  else
    update archive_expiry_runs set state = 'completed', completed_at = clock_timestamp() where id = p_run;
  end if;
  perform log_admin(null, 'zamanlayıcı', 'archive_expiry_finished', ru.event_id, null, null,
    jsonb_build_object('run', p_run, 'deleted', deleted_n, 'failed', failed_n, 'manifest_hash', ru.manifest_hash));
  return case when failed_n > 0 then 'failed' else 'completed' end;
end $$;

-- Head admin: okuyucuların yeni sürümde olduğunu ve kuru koşum özetini kaydeder (0021'in önkoşulu).
-- Yalnız yeni uygulama bu düğmeyi gösterir; kayıt silme açmaz.
create function public.confirm_archive_readers(p_actor uuid, p_login text, p_summary jsonb, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_head_admin(p_actor); perform require_reason(p_reason);
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' then raise exception 'SAKLAMA: Kuru koşum özeti gerekli.'; end if;
  update archive_retention_settings set readers_confirmed_at = clock_timestamp(), readers_confirmed_by = p_actor, dry_run_summary = p_summary where id;
  perform log_admin(p_actor, p_login, 'archive_readers_confirmed', null, null, null, jsonb_build_object('summary', p_summary), p_reason);
end $$;

-- Etkinleştirme: head admin + gerekçe (+ uygulamada taze oturum). Kapı kapalıyken açılamaz. Kapatmak serbesttir;
-- kapatmak daha önce silinen dosyaları geri getirmez. Topluluk sahibi süreyi uzatamaz ya da temizliği atlatamaz.
create function public.set_archive_retention(p_actor uuid, p_login text, p_enabled boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s archive_retention_settings;
begin
  perform require_head_admin(p_actor); perform require_reason(p_reason);
  select * into s from archive_retention_settings where id for update;
  if p_enabled and not archive_retention_gate_open() then
    raise exception 'SAKLAMA: Süreli silme aktivasyon migration''ı (0021) uygulanmadan açılamaz.';
  end if;
  if p_enabled and s.readers_confirmed_at is null then raise exception 'SAKLAMA: Önce okuyucu sürümü ve kuru koşum onaylanmalı.'; end if;
  if s.enabled is not distinct from p_enabled then return; end if;
  update archive_retention_settings set enabled = p_enabled, changed_by = p_actor, changed_login = p_login, changed_at = clock_timestamp(), reason = btrim(p_reason) where id;
  perform log_admin(p_actor, p_login, case when p_enabled then 'archive_retention_enabled' else 'archive_retention_disabled' end, null, null,
    jsonb_build_object('enabled', s.enabled), jsonb_build_object('enabled', p_enabled), p_reason);
end $$;

-- Platform raporu: silinen/başarısız/bekleyen sayıları, en eski vadesi geçmiş iş ve son başarılı silme.
create function public.archive_retention_report() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'enabled', archive_retention_enabled(),
    'gate_open', archive_retention_gate_open(),
    'readers_confirmed_at', (select readers_confirmed_at from archive_retention_settings where id),
    'deleted', (select count(*) from archive_expiry_objects where state = 'deleted'),
    'failed', (select count(*) from archive_expiry_objects where state = 'failed'),
    'pending', (select count(*) from archive_expiry_objects where state in ('pending', 'processing')),
    'blocked_runs', (select count(*) from archive_expiry_runs where state in ('blocked', 'failed')),
    'oldest_overdue', (select min(e.archive_expires_at) from events e where e.archive_expires_at <= clock_timestamp()
      and not exists(select 1 from archive_expiry_runs r where r.event_id = e.id and r.state = 'completed')),
    'last_success', (select max(deleted_at) from archive_expiry_objects))
$$;

-- Süre dolduktan sonra yeniden mühürleme yok ---------------------------------------------------------
-- İşçi süresi dolmuş etkinlik için yeni mühür işi açmaz (satır sessizce atlanır; enqueue_seals her dakika
-- çağrılır) ve mühür alanları yazılamaz. GitHub'dan güncel HEAD'i arşivleyip eski teslimi canlandırma yolu yok.
create function public.archive_expired(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select archive_expires_at <= clock_timestamp() from events where id = p_event), false)
$$;

create function public.skip_expired_seal_job() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'seal' and public.archive_expired(new.event_id) then return null; end if;
  return new;
end $$;
create trigger delivery_jobs_zz_retention before insert on public.delivery_jobs
for each row execute function public.skip_expired_seal_job();

create function public.guard_expired_seal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.archive_sha256 is distinct from old.archive_sha256 and old.archive_sha256 is null and public.archive_expired(new.event_id) then
    raise exception 'SAKLAMA: Arşivin 30 günlük saklama süresi doldu; mühür yeniden oluşturulamaz.';
  end if;
  return new;
end $$;
create trigger projects_zz_retention before update on public.projects
for each row execute function public.guard_expired_seal();

-- Erişim: istemciler okuyamaz/yazamaz; defteri yalnız sunucu yardımcıları değiştirir.
alter table public.archive_expiry_runs enable row level security;
alter table public.archive_expiry_objects enable row level security;
alter table public.archive_retention_settings enable row level security;
revoke all on public.archive_expiry_runs, public.archive_expiry_objects, public.archive_retention_settings from public, anon, authenticated, service_role;
grant select on public.archive_expiry_runs, public.archive_expiry_objects to service_role;
grant select (id, enabled, readers_confirmed_at, changed_at) on public.archive_retention_settings to service_role;

revoke all on function
  public.set_archive_expiry(), public.archive_availability(uuid, timestamptz), public.archive_access(uuid),
  public.guard_archive_expiry_run(), public.guard_archive_expiry_object(), public.archive_retention_gate_open(),
  public.archive_retention_enabled(), public.archive_expiry_manifest(uuid), public.archive_manifest_hash(text[]),
  public.archive_expiry_preview(uuid), public.prepare_archive_expiry(uuid), public.claim_archive_expiry_objects(integer),
  public.complete_archive_expiry_object(uuid, uuid), public.fail_archive_expiry_object(uuid, uuid, text),
  public.finalize_archive_expiry(uuid), public.confirm_archive_readers(uuid, text, jsonb, text),
  public.set_archive_retention(uuid, text, boolean, text), public.archive_retention_report(),
  public.archive_expired(uuid), public.skip_expired_seal_job(), public.guard_expired_seal()
  from public, anon, authenticated, service_role;
grant execute on function
  public.archive_availability(uuid, timestamptz), public.archive_access(uuid), public.archive_retention_gate_open(),
  public.archive_retention_enabled(), public.archive_expiry_manifest(uuid), public.archive_manifest_hash(text[]),
  public.archive_expiry_preview(uuid), public.prepare_archive_expiry(uuid), public.claim_archive_expiry_objects(integer),
  public.complete_archive_expiry_object(uuid, uuid), public.fail_archive_expiry_object(uuid, uuid, text),
  public.finalize_archive_expiry(uuid), public.confirm_archive_readers(uuid, text, jsonb, text),
  public.set_archive_retention(uuid, text, boolean, text), public.archive_retention_report(), public.archive_expired(uuid)
  to service_role;

commit;
