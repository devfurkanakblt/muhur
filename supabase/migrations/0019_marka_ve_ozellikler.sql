-- Plan 5 · Topluluk markası, etkinlik rengi, etkinlik özellikleri ve kilitte donan görünüm snapshot'u.
-- Additive: eski uygulama çalışmaya devam eder. Mevcut DEÜ etkinlikleri bütün özellikleri açık tutar
-- (geçmiş davranış); diğer toplulukların etkinliklerinde özellikler kapalı başlar.
-- Bu migration hiçbir SHA, hash, arşiv yolu, kilit zamanı veya sözleşme kanıtı alanına dokunmaz.
begin;

-- Topluluk markası ---------------------------------------------------------------------------------
alter table public.communities
  add column logo_path text,
  add column branding_updated_at timestamptz,
  add constraint communities_logo_path_own check (logo_path is null or logo_path ~ ('^topluluk/' || id::text || '/[a-f0-9]{24}\.webp$'));

-- Renk: yalnız #rrggbb. SVG/CSS/URL ya da özel stil kabul edilmez.
create function public.brand_color_luminance(p_hex text) returns double precision
language plpgsql immutable set search_path = public as $$
declare c double precision[]; v double precision; i int; out double precision := 0; w double precision[] := array[0.2126, 0.7152, 0.0722];
begin
  for i in 0..2 loop
    v := ('x' || substr(p_hex, 2 + i * 2, 2))::bit(8)::int / 255.0;
    v := case when v <= 0.04045 then v / 12.92 else power((v + 0.055) / 1.055, 2.4) end;
    out := out + w[i + 1] * v;
  end loop;
  return out;
end $$;

create function public.brand_color_contrast(p_a text, p_b text) returns double precision
language sql immutable set search_path = public as $$
  select (greatest(brand_color_luminance(p_a), brand_color_luminance(p_b)) + 0.05)
       / (least(brand_color_luminance(p_a), brand_color_luminance(p_b)) + 0.05)
$$;

-- Açık temadaki metin/kontrol çiftleri (lib/branding.ts ile aynı): duvar ve kaide üzerinde metin,
-- dolgu üzerinde beyaz metin. Koyu tema tonu uygulamada deterministik olarak türetilir.
create function public.brand_color_readable(p_hex text) returns boolean
language sql immutable set search_path = public as $$
  select p_hex ~ '^#[0-9a-f]{6}$'
    and brand_color_contrast(p_hex, '#eef2f6') >= 4.5
    and brand_color_contrast(p_hex, '#f8f9fb') >= 4.5
    and brand_color_contrast(p_hex, '#ffffff') >= 4.5
$$;

-- Etkinlik sunumu ----------------------------------------------------------------------------------
create function public.valid_event_features(p_features jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(p_features) = 'object'
    and (select array_agg(k order by k) from jsonb_object_keys(p_features) k)
        = array['easter_eggs', 'mascot_naming', 'mystery_hunt', 'public_voting']
    and (select bool_and(jsonb_typeof(v) = 'boolean') from jsonb_each(p_features) e(k, v))
$$;

alter table public.events
  add column accent_color text check (accent_color is null or public.brand_color_readable(accent_color)),
  add column features jsonb not null default
    '{"public_voting":false,"mystery_hunt":false,"easter_eggs":false,"mascot_naming":false}'::jsonb
    check (public.valid_event_features(features)),
  add column presentation_updated_at timestamptz;

-- Maskot DEÜ CS&AI'ya aittir: topluluğu olmayan (Plan 1 öncesi) etkinlikler de DEÜ sayılır.
create function public.is_mascot_community(p_community uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_community is null or exists(select 1 from communities where id = p_community and slug = 'deu-csai')
$$;

create function public.default_event_features(p_community uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_mascot_community(p_community)
    then '{"public_voting":true,"mystery_hunt":true,"easter_eggs":true,"mascot_naming":true}'::jsonb
    else '{"public_voting":false,"mystery_hunt":false,"easter_eggs":false,"mascot_naming":false}'::jsonb end
$$;

-- Geçmiş davranış korunur: mevcut DEÜ etkinlikleri açık, diğerleri kapalı.
update public.events set features = public.default_event_features(community_id);

-- Bayrak okuma: geçersiz/eksik anahtar kapalı sayılır (fail-closed).
create function public.event_feature(p_event uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (features ->> p_key)::boolean from events where id = p_event), false)
$$;

-- Yeni etkinliğin varsayılanları gerçek topluluğundan, ekleme ile aynı satırda kurulur. İstemciden gelen
-- bir değer (ör. "DEÜ mü") burada etkili değildir; ekleme yapan hiçbir RPC özellik parametresi almaz.
create function public.set_event_feature_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.features := public.default_event_features(new.community_id);
  new.accent_color := null;
  return new;
end $$;
create trigger events_feature_defaults before insert on public.events
for each row execute function public.set_event_feature_defaults();

-- Sunum alanları yalnız update_event_presentation içinden değişir (işlem yerel bayrağı). Maskot bayrağı
-- başka toplulukta hiçbir yoldan açılamaz; halk oylaması kapalı etkinlikte oylama açılamaz.
create function public.guard_event_presentation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.features, new.accent_color) is distinct from (old.features, old.accent_color)
    and coalesce(current_setting('muhur.presentation', true), '') <> 'on' then
    raise exception 'OZELLIK: Etkinlik görünümü yalnız sunum ayarlarından değiştirilir.' using errcode = 'P0001';
  end if;
  if (new.features ->> 'mascot_naming')::boolean and not public.is_mascot_community(new.community_id) then
    raise exception 'OZELLIK: Maskot isimlendirme yalnız DEÜ CS&AI etkinliklerinde açılabilir.' using errcode = 'P0001';
  end if;
  if new.voting is distinct from old.voting and old.voting = 'kapali'
    and not coalesce((new.features ->> 'public_voting')::boolean, false) then
    raise exception 'OZELLIK: Halk oylaması bu etkinlikte kapalı.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger events_presentation_guard before update on public.events
for each row execute function public.guard_event_presentation();

-- Kapalı özellik doğrudan tablo yazmasında da kapalıdır ---------------------------------------------
-- Tetikleyiciler ada göre sıralanır: "aa" adları mevcut guard'lardan önce çalışır, böylece kapalı özellik
-- başka bir hata yerine açık OZELLIK mesajıyla reddedilir.
create function public.assert_event_feature(p_event uuid, p_key text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.event_feature(p_event, p_key) then
    raise exception 'OZELLIK: %', case p_key
      when 'public_voting' then 'Halk oylaması bu etkinlikte kapalı.'
      when 'mystery_hunt' then 'Gizem avı bu etkinlikte kapalı.'
      when 'mascot_naming' then 'Maskot isimlendirme bu etkinlikte kapalı.'
      else 'Bu özellik bu etkinlikte kapalı.' end using errcode = 'P0001';
  end if;
end $$;

create function public.guard_vote_feature() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_event_feature(new.event_id, 'public_voting');
  return new;
end $$;
create trigger votes_aa_feature_guard before insert on public.votes
for each row execute function public.guard_vote_feature();

create function public.guard_mystery_feature() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_event_feature(new.event_id, 'mystery_hunt');
  return new;
end $$;
create trigger mystery_hunters_feature_guard before insert on public.mystery_hunters
for each row execute function public.guard_mystery_feature();

-- Anonimleştirme (yalnız kimlik alanları) engellenmez; öneri, isim değişikliği, oy ve aşama değişimi engellenir.
create function public.guard_mascot_feature() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- İç içe IF: kayıt alanı yalnız ilgili tabloda okunur (PL/pgSQL AND'i kısa devre etmez).
  if tg_op = 'UPDATE' then
    if tg_table_name = 'mascot_name_proposals' then
      if (new.name, new.visible) is not distinct from (old.name, old.visible) then return new; end if;
    elsif tg_table_name = 'mascot_naming_rounds' then
      if new.phase is not distinct from old.phase then return new; end if;
    end if;
  end if;
  perform public.assert_event_feature(new.event_id, 'mascot_naming');
  return new;
end $$;
create trigger mascot_aa_proposal_feature_guard before insert or update on public.mascot_name_proposals
for each row execute function public.guard_mascot_feature();
create trigger mascot_aa_vote_feature_guard before insert on public.mascot_name_votes
for each row execute function public.guard_mascot_feature();
create trigger mascot_aa_round_feature_guard before update on public.mascot_naming_rounds
for each row execute function public.guard_mascot_feature();

-- Kilitte donan görünüm --------------------------------------------------------------------------
-- Yalnız görünüm bilgisidir; teslim hash'inin ya da mühür kaydının parçası değildir.
create table public.event_brand_snapshots (
  event_id uuid primary key references public.events(id) on delete restrict,
  community_id uuid references public.communities(id),
  community_name text,
  community_logo_path text,
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-f]{6}$'),
  event_title text not null,
  source text not null check (source in ('lock', 'worker', 'legacy')),
  captured_at timestamptz not null default clock_timestamp()
);
create index event_brand_snapshots_logo on public.event_brand_snapshots(community_logo_path) where community_logo_path is not null;

create function public.guard_brand_snapshot() returns trigger
language plpgsql set search_path = public as $$
begin raise exception 'LOCKED: Mühürlü etkinlik görünümü değiştirilemez.'; end $$;
create trigger event_brand_snapshots_immutable before update or delete on public.event_brand_snapshots
for each row execute function public.guard_brand_snapshot();

create function public.capture_event_brand(p_event uuid, p_source text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into event_brand_snapshots(event_id, community_id, community_name, community_logo_path, accent_color, event_title, source)
  select e.id, e.community_id, c.name, c.logo_path, e.accent_color, e.title, p_source
  from events e left join communities c on c.id = e.community_id where e.id = p_event
  on conflict (event_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Kalıcı kilit yazıldığı transaction'da görünüm donar (cron, yönetici ya da son tarih kilidi).
create function public.capture_brand_on_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.locked_at is null and new.locked_at is not null then perform public.capture_event_brand(new.id, 'lock'); end if;
  return new;
end $$;
create trigger events_brand_on_lock after update of locked_at on public.events
for each row execute function public.capture_brand_on_lock();

-- İşçi telafisi: kilitli etkinlikte snapshot yoksa tek sefer tamamlar. Kilit/hash alanlarına dokunmaz.
create function public.ensure_event_brand_snapshot(p_event uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_locked(p_event) then return false; end if;
  return public.capture_event_brand(p_event, 'worker');
end $$;

-- Geçmiş kilitli etkinlikler: migration anındaki bilinen marka; geçmişte logo varmış gibi üretilmez.
insert into public.event_brand_snapshots(event_id, community_id, community_name, community_logo_path, accent_color, event_title, source)
select e.id, e.community_id, c.name, null, null, e.title, 'legacy'
from public.events e left join public.communities c on c.id = e.community_id
where e.locked_at is not null or clock_timestamp() >= e.deadline
on conflict (event_id) do nothing;

-- RPC'ler -----------------------------------------------------------------------------------------
-- Topluluk markası: yalnız sahip; onaylı, askıda olmayan topluluk; Plan 4 yönetim onayı (require_community_manager).
-- İzinli alanlar: name, university, city, link, logo_path. Başvuru iletişim/sahip/durum alanları buradan değişmez.
create function public.update_community_branding(p_actor uuid, p_login text, p_community uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b communities; k text; v_name text; v_uni text; v_city text; v_link text; v_logo text; previous text;
begin
  perform require_community_manager(p_community, p_actor, true);
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'Marka bilgileri geçersiz.'; end if;
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('name', 'university', 'city', 'link', 'logo_path') then raise exception 'Marka alanı değiştirilemez: %', k; end if;
    if jsonb_typeof(p_changes -> k) not in ('string', 'null') then raise exception 'Marka bilgileri geçersiz.'; end if;
  end loop;
  select * into b from communities where id = p_community for update;
  v_name := case when p_changes ? 'name' then btrim(p_changes ->> 'name') else b.name end;
  v_uni := case when p_changes ? 'university' then nullif(btrim(p_changes ->> 'university'), '') else b.university end;
  v_city := case when p_changes ? 'city' then nullif(btrim(p_changes ->> 'city'), '') else b.city end;
  v_link := case when p_changes ? 'link' then nullif(btrim(p_changes ->> 'link'), '') else b.link end;
  v_logo := case when p_changes ? 'logo_path' then nullif(p_changes ->> 'logo_path', '') else b.logo_path end;
  if v_name is null or char_length(v_name) not between 2 and 80 or v_name ~ '[[:cntrl:]]' then raise exception 'Topluluk adı 2-80 karakter olmalı.'; end if;
  if coalesce(char_length(v_uni), 0) > 160 or v_uni ~ '[[:cntrl:]]' then raise exception 'Üniversite / kurum en fazla 160 karakter olabilir.'; end if;
  if coalesce(char_length(v_city), 0) > 80 or v_city ~ '[[:cntrl:]]' then raise exception 'Şehir en fazla 80 karakter olabilir.'; end if;
  if v_link is not null and not safe_https_link(v_link) then raise exception 'Bağlantı geçerli bir HTTPS adresi olmalı.'; end if;
  if v_logo is not null and v_logo !~ ('^topluluk/' || p_community::text || '/[a-f0-9]{24}\.webp$') then raise exception 'Logo yolu geçersiz.'; end if;
  if (v_name, v_uni, v_city, v_link, v_logo) is not distinct from (b.name, b.university, b.city, b.link, b.logo_path) then
    return jsonb_build_object('changed', false, 'previous_logo', null);
  end if;
  update communities set name = v_name, university = v_uni, city = v_city, link = v_link, logo_path = v_logo,
    branding_updated_at = clock_timestamp() where id = p_community;
  -- Eski logo mühürlü bir etkinliğin görünümünde kullanılıyorsa silinmek üzere döndürülmez.
  if b.logo_path is not null and b.logo_path is distinct from v_logo
    and not exists(select 1 from event_brand_snapshots where community_logo_path = b.logo_path) then
    previous := b.logo_path;
  end if;
  perform log_admin(p_actor, p_login, 'community_branding_updated', null, null,
    jsonb_build_object('community', b.id, 'name', b.name, 'university', b.university, 'city', b.city, 'link', b.link, 'logo_path', b.logo_path),
    jsonb_build_object('community', b.id, 'name', v_name, 'university', v_uni, 'city', v_city, 'link', v_link, 'logo_path', v_logo));
  return jsonb_build_object('changed', true, 'previous_logo', previous);
end $$;

-- Etkinlik sunumu: renk ve özellikler. Rol, askı ve Plan 4 onayı require_event_manager'da; kilitten sonra
-- sunum donar. Özellikler yalnız etkinlik başlamadan ve kapatılan özelliğin kaydı yokken değişir:
-- var olan oy, öneri ya da gizem kazanımı kapatılarak görünmez yapılamaz.
create function public.update_event_presentation(p_actor uuid, p_login text, p_event uuid, p_color text, p_features jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare ev events; color text := nullif(lower(btrim(coalesce(p_color, ''))), '');
begin
  perform require_event_manager(p_event, p_actor);
  select * into ev from events where id = p_event for update;
  if not found then raise exception 'Etkinlik bulunamadı.'; end if;
  if public.is_locked(p_event) then raise exception 'LOCKED: Kilit sonrası etkinlik görünümü değiştirilemez.'; end if;
  if p_features is null or not valid_event_features(p_features) then raise exception 'OZELLIK: Özellik ayarları geçersiz.'; end if;
  if color is not null and color !~ '^#[0-9a-f]{6}$' then raise exception 'OZELLIK: Renk #RRGGBB biçiminde olmalı.'; end if;
  if color is not null and not brand_color_readable(color) then raise exception 'OZELLIK: Bu renk açık temada okunabilir değil.'; end if;
  if (p_features ->> 'mascot_naming')::boolean and not is_mascot_community(ev.community_id) then
    raise exception 'OZELLIK: Maskot isimlendirme yalnız DEÜ CS&AI etkinliklerinde açılabilir.';
  end if;
  if p_features is distinct from ev.features then
    if clock_timestamp() >= ev.starts_at then raise exception 'OZELLIK: Etkinlik başladıktan sonra özellikler değiştirilemez.'; end if;
    if (ev.features ->> 'public_voting')::boolean and not (p_features ->> 'public_voting')::boolean
      and exists(select 1 from votes where event_id = p_event) then raise exception 'OZELLIK: Oy verilmiş etkinlikte halk oylaması kapatılamaz.'; end if;
    if (ev.features ->> 'mystery_hunt')::boolean and not (p_features ->> 'mystery_hunt')::boolean
      and exists(select 1 from mystery_hunters where event_id = p_event) then raise exception 'OZELLIK: Gizem çözülmüş etkinlikte gizem avı kapatılamaz.'; end if;
    if (ev.features ->> 'mascot_naming')::boolean and not (p_features ->> 'mascot_naming')::boolean
      and (exists(select 1 from mascot_name_proposals where event_id = p_event) or exists(select 1 from mascot_name_votes where event_id = p_event)) then
      raise exception 'OZELLIK: İsim önerisi olan etkinlikte maskot isimlendirme kapatılamaz.';
    end if;
  end if;
  if (color, p_features) is not distinct from (ev.accent_color, ev.features) then return; end if;
  perform set_config('muhur.presentation', 'on', true);
  update events set accent_color = color, features = p_features, presentation_updated_at = clock_timestamp() where id = p_event;
  perform set_config('muhur.presentation', 'off', true);
  perform log_admin(p_actor, p_login, 'event_presentation_updated', p_event, null,
    jsonb_build_object('accent_color', ev.accent_color, 'features', ev.features),
    jsonb_build_object('accent_color', color, 'features', p_features));
end $$;

-- Erişim -----------------------------------------------------------------------------------------
alter table public.event_brand_snapshots enable row level security;
revoke all on public.event_brand_snapshots from public, anon, authenticated, service_role;
grant select on public.event_brand_snapshots to service_role;

revoke all on function
  public.brand_color_luminance(text), public.brand_color_contrast(text, text), public.brand_color_readable(text),
  public.valid_event_features(jsonb), public.is_mascot_community(uuid), public.default_event_features(uuid),
  public.event_feature(uuid, text), public.set_event_feature_defaults(), public.guard_event_presentation(),
  public.assert_event_feature(uuid, text), public.guard_vote_feature(), public.guard_mystery_feature(),
  public.guard_mascot_feature(), public.guard_brand_snapshot(), public.capture_event_brand(uuid, text),
  public.capture_brand_on_lock(), public.ensure_event_brand_snapshot(uuid),
  public.update_community_branding(uuid, text, uuid, jsonb), public.update_event_presentation(uuid, text, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
-- Kısıt ifadelerinde kullanılan saf yardımcılar servis rolüne açıktır (yan etkisiz).
grant execute on function
  public.brand_color_luminance(text), public.brand_color_contrast(text, text), public.brand_color_readable(text),
  public.valid_event_features(jsonb), public.event_feature(uuid, text), public.ensure_event_brand_snapshot(uuid),
  public.update_community_branding(uuid, text, uuid, jsonb), public.update_event_presentation(uuid, text, uuid, text, jsonb)
  to service_role;

commit;
