-- Gizem avcıları: açılış videosundaki gizli mesajı çözüp Ctrl+Shift+S penceresine doğru cümleyi yazanlar.
-- Rozet takıma aittir: ekibinden biri bulmuşsa projenin "gizem avcısı" rozeti açılır.
-- 0006'dan sonra uygulanır, geriye uyumludur: önce migration, sonra `npm run check:schema`, ardından uygulama yayını.
begin;

create table public.mystery_hunters (
  event_id uuid not null references public.events (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  github_login text not null,
  found_at timestamptz not null default clock_timestamp(),
  primary key (event_id, user_id)
);

-- Kayıt yalnızca hackathon saatlerinde açılır (başlangıçtan kilide kadar). Aynı kişi ikinci kez yazarsa
-- ilk bulma anı korunur. Cevabın doğruluğu uygulamada denetlenir; burada yalnızca zaman ve tekillik kuralı var.
create function public.claim_mystery(p_event uuid, p_user uuid, p_login text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare starts timestamptz; found timestamptz;
begin
  if p_login is null or char_length(btrim(p_login)) = 0 then raise exception 'Geçersiz kullanıcı'; end if;
  select starts_at into starts from events where id = p_event for share;
  if starts is null then raise exception 'MYSTERY: Etkinlik bulunamadı.'; end if;
  if clock_timestamp() < starts or public.is_locked(p_event) then
    raise exception 'MYSTERY: Gizem yalnızca hackathon saatlerinde açık.' using errcode = 'P0001';
  end if;
  insert into mystery_hunters (event_id, user_id, github_login) values (p_event, p_user, p_login)
  on conflict (event_id, user_id) do nothing;
  select found_at into found from mystery_hunters where event_id = p_event and user_id = p_user;
  return found;
end $$;

-- Kişisel veri silme gizem kaydındaki GitHub adını da anonimleştirir.
create or replace function public.anonymize_user(p_user uuid, p_actor uuid, p_login text, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare alias text := 'anonim-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8); n integer; m integer; g integer;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'Anonimleştirme gerekçesi gerekli.'; end if;
  perform set_config('muhur.anonymize', 'on', true);
  update project_members set github_login = alias, avatar_url = null where user_id = p_user;
  get diagnostics n = row_count;
  update votes set github_login = alias where user_id = p_user;
  get diagnostics m = row_count;
  update mystery_hunters set github_login = alias where user_id = p_user;
  get diagnostics g = row_count;
  perform set_config('muhur.anonymize', 'off', true);
  perform public.log_admin(p_actor, p_login, 'anonymize_user', null, null, jsonb_build_object('user', p_user),
    jsonb_build_object('alias', alias, 'memberships', n, 'votes', m, 'mysteries', g), p_reason);
  return n + m + g;
end $$;

create or replace function public.delivery_schema_version() returns integer
language sql immutable security definer set search_path = public as $$ select 7 $$;

-- Erişim: tablo dışarıdan okunamaz ve yazılamaz; sunucu servis anahtarıyla RPC üzerinden yazar.
alter table public.mystery_hunters enable row level security;
revoke all on public.mystery_hunters from anon, authenticated;
grant select on public.mystery_hunters to service_role;

revoke execute on function public.claim_mystery(uuid, uuid, text), public.anonymize_user(uuid, uuid, text, text),
  public.delivery_schema_version() from public, anon, authenticated;
grant execute on function public.claim_mystery(uuid, uuid, text), public.anonymize_user(uuid, uuid, text, text),
  public.delivery_schema_version() to service_role;

commit;
