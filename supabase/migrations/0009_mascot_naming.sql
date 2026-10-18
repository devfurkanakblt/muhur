-- Maskot isim etkinliği, proje oylamasından bağımsızdır.
-- anonymize_user, 0007_gizem sürümünü de kapsar (gizem avcısı kaydı da anonimleşir).
begin;

create table public.mascot_naming_rounds (
  event_id uuid primary key references public.events(id) on delete restrict,
  phase text not null default 'oneriler' check (phase in ('oneriler', 'oylama', 'sonuc')),
  updated_at timestamptz not null default now()
);

insert into public.mascot_naming_rounds(event_id)
select id from public.events on conflict do nothing;

create or replace function public.create_mascot_naming_round() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.mascot_naming_rounds(event_id) values (new.id);
  return new;
end $$;
create trigger events_mascot_naming_round after insert on public.events
for each row execute function public.create_mascot_naming_round();

create or replace function public.guard_mascot_naming_round() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' or new.event_id is distinct from old.event_id then
    raise exception 'MASCOT: Tur silinemez.' using errcode = 'P0001';
  end if;
  if new.phase is distinct from old.phase and not (
    (old.phase = 'oneriler' and new.phase = 'oylama') or
    (old.phase = 'oylama' and new.phase = 'sonuc')
  ) then
    raise exception 'MASCOT: Geçersiz aşama geçişi.' using errcode = 'P0001';
  end if;
  if old.phase = 'oneriler' and new.phase = 'oylama' and not exists (
    select 1 from public.mascot_name_proposals where event_id = old.event_id and visible
  ) then
    raise exception 'MASCOT: Oylama için görünür bir isim gerekli.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger mascot_naming_round_guard before update or delete on public.mascot_naming_rounds
for each row execute function public.guard_mascot_naming_round();

create table public.mascot_name_proposals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  author_login text not null,
  name text not null check (char_length(name) between 2 and 24 and name !~ '[[:cntrl:]]'),
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  unique(event_id, author_id),
  unique(id, event_id)
);
create unique index mascot_name_proposals_unique_name on public.mascot_name_proposals(event_id, lower(name));
create index mascot_name_proposals_event on public.mascot_name_proposals(event_id, created_at);

create or replace function public.guard_mascot_name_proposal() returns trigger
language plpgsql security definer set search_path = public as $$
declare current_phase text;
begin
  if tg_op = 'DELETE' then
    raise exception 'MASCOT: Öneri silinemez.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and current_setting('muhur.anonymize', true) = 'on' and
    (new.id, new.event_id, new.author_id, new.name, new.visible, new.created_at)
      is not distinct from
    (old.id, old.event_id, old.author_id, old.name, old.visible, old.created_at) then
    return new;
  end if;
  select phase into current_phase from public.mascot_naming_rounds where event_id = new.event_id for update;
  if current_phase is distinct from 'oneriler' then
    raise exception 'MASCOT: Öneri aşaması kapalı.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.project_members
      where event_id = new.event_id and user_id = new.author_id
    ) then
      raise exception 'MASCOT: Yalnızca yarışmacılar isim önerebilir.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if (new.id, new.event_id, new.author_id, new.author_login, new.name, new.created_at)
    is distinct from (old.id, old.event_id, old.author_id, old.author_login, old.name, old.created_at) then
    raise exception 'MASCOT: Öneri değiştirilemez.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger mascot_name_proposal_guard before insert or update or delete on public.mascot_name_proposals
for each row execute function public.guard_mascot_name_proposal();

create table public.mascot_name_votes (
  event_id uuid not null references public.events(id) on delete restrict,
  voter_id uuid not null references auth.users(id) on delete restrict,
  voter_login text not null,
  proposal_id uuid not null,
  voted_at timestamptz not null default now(),
  primary key(event_id, voter_id),
  foreign key(proposal_id, event_id) references public.mascot_name_proposals(id, event_id) on delete restrict
);
create index mascot_name_votes_proposal on public.mascot_name_votes(proposal_id);

create or replace function public.guard_mascot_name_vote() returns trigger
language plpgsql security definer set search_path = public as $$
declare current_phase text; proposal_author uuid; proposal_visible boolean;
begin
  if tg_op = 'UPDATE' and current_setting('muhur.anonymize', true) = 'on' and
    (new.event_id, new.voter_id, new.proposal_id, new.voted_at)
      is not distinct from
    (old.event_id, old.voter_id, old.proposal_id, old.voted_at) then
    return new;
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'MASCOT: Oy değiştirilemez.' using errcode = 'P0001';
  end if;
  select phase into current_phase from public.mascot_naming_rounds where event_id = new.event_id for update;
  if current_phase is distinct from 'oylama' then
    raise exception 'MASCOT: Oylama açık değil.' using errcode = 'P0001';
  end if;
  select author_id, visible into proposal_author, proposal_visible
  from public.mascot_name_proposals where id = new.proposal_id and event_id = new.event_id;
  if proposal_author is null or not proposal_visible then
    raise exception 'MASCOT: Bu isim oylamada yok.' using errcode = 'P0001';
  end if;
  if proposal_author = new.voter_id then
    raise exception 'MASCOT: Kendi önerine oy veremezsin.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger mascot_name_vote_guard before insert or update or delete on public.mascot_name_votes
for each row execute function public.guard_mascot_name_vote();

create or replace function public.mascot_name_tallies(ev uuid)
returns table(proposal_id uuid, vote_count bigint)
language sql stable security definer set search_path = public as $$
  select p.id, count(v.voter_id)
  from public.mascot_name_proposals p
  left join public.mascot_name_votes v on v.proposal_id = p.id
  where p.event_id = ev and p.visible
  group by p.id
$$;

-- Mevcut hesap anonimleştirme işlemi maskot etkinliğindeki kullanıcı adlarını da kapsar.
create or replace function public.anonymize_user(p_user uuid, p_actor uuid, p_login text, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare alias text := 'anonim-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  n integer; m integer; g integer; proposals_n integer; mascot_votes_n integer;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'Anonimleştirme gerekçesi gerekli.'; end if;
  perform set_config('muhur.anonymize', 'on', true);
  update project_members set github_login = alias, avatar_url = null where user_id = p_user;
  get diagnostics n = row_count;
  update votes set github_login = alias where user_id = p_user;
  get diagnostics m = row_count;
  update mystery_hunters set github_login = alias where user_id = p_user;
  get diagnostics g = row_count;
  update mascot_name_proposals set author_login = alias where author_id = p_user;
  get diagnostics proposals_n = row_count;
  update mascot_name_votes set voter_login = alias where voter_id = p_user;
  get diagnostics mascot_votes_n = row_count;
  perform set_config('muhur.anonymize', 'off', true);
  perform public.log_admin(p_actor, p_login, 'anonymize_user', null, null, jsonb_build_object('user', p_user),
    jsonb_build_object('alias', alias, 'memberships', n, 'votes', m, 'mysteries', g, 'mascot_proposals', proposals_n,
      'mascot_votes', mascot_votes_n), p_reason);
  return n + m + g + proposals_n + mascot_votes_n;
end $$;

alter table public.mascot_naming_rounds enable row level security;
alter table public.mascot_name_proposals enable row level security;
alter table public.mascot_name_votes enable row level security;
revoke all on public.mascot_naming_rounds, public.mascot_name_proposals, public.mascot_name_votes from anon, authenticated;
revoke execute on function public.create_mascot_naming_round(), public.guard_mascot_naming_round(),
  public.guard_mascot_name_proposal(), public.guard_mascot_name_vote(), public.mascot_name_tallies(uuid)
  from public, anon, authenticated;
grant all on public.mascot_naming_rounds, public.mascot_name_proposals, public.mascot_name_votes to service_role;
grant execute on function public.mascot_name_tallies(uuid) to service_role;

commit;
