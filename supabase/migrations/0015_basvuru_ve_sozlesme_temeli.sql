-- Başvuru ve ortak sözleşme/e-posta temeli. Genel açılış sunucuda ayrıca kapalıdır.
begin;
alter table public.communities
  add column previous_application_id uuid references public.communities(id),
  add column application_request_id uuid,
  add column application_fingerprint text;
create unique index community_pending_applicant on public.communities(applicant_id) where status='beklemede';
create unique index community_application_request on public.communities(applicant_id,application_request_id);

create table public.policy_documents (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('platform','data_processing','participant')),
 version text not null check(char_length(version) between 1 and 40), content text not null,
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in ('draft','published','retired')),
 published_at timestamptz, created_at timestamptz not null default clock_timestamp(), unique(kind,version),
 check(content_sha256=encode(sha256(convert_to(content,'UTF8')),'hex')),
 check(status='draft' or published_at is not null)
);
create table public.policy_subjects(id uuid primary key default gen_random_uuid(),user_id uuid unique references auth.users(id) on delete set null);
create table public.policy_requirements(kind text primary key check(kind in ('platform','data_processing','participant')),document_id uuid not null references policy_documents(id));
create table public.policy_acceptances(
 id uuid primary key default gen_random_uuid(),subject_id uuid not null references policy_subjects(id),document_id uuid not null references policy_documents(id),
 scope_kind text not null check(scope_kind in ('community','event')),scope_id uuid not null,accepted_at timestamptz not null default clock_timestamp(),
 unique(subject_id,document_id,scope_kind,scope_id)
);
create table public.mail_outbox (
 id uuid primary key default gen_random_uuid(),dedupe_key text not null unique,
 kind text not null check(kind in ('application_received','application_approved','application_rejected','organizer_invite','jury_invite')),
 community_id uuid references communities(id),event_id uuid references events(id),invite_id uuid,
 recipient_email text not null check(char_length(recipient_email)<=254),payload jsonb not null default '{}',secret_payload text,
 state text not null default 'pending' check(state in ('pending','leased','accepted','uncertain','dead','cancelled')),
 delivery_state text not null default 'unknown' check(delivery_state in ('unknown','sent','delivered','bounced','blocked')),
 lease_token uuid,lease_until timestamptz,attempts integer not null default 0,
 next_attempt_at timestamptz not null default clock_timestamp(),provider_message_id text unique,
 created_at timestamptz not null default clock_timestamp(),accepted_at timestamptz,last_error text,
 check(char_length(last_error)<=500)
);
create index mail_outbox_due on mail_outbox(next_attempt_at,created_at) where state='pending';

create function public.lock_role_users(p_users uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; begin
 for u in select distinct x from unnest(p_users) x where x is not null order by x loop
  perform pg_advisory_xact_lock(hashtextextended('muhur-role:'||u::text,0));
 end loop;
end $$;
create function public.guard_policy_document() returns trigger language plpgsql set search_path=public as $$
begin
 if old.status <> 'draft' and (tg_op='DELETE' or new.status='draft' or (new.kind,new.version,new.content,new.content_sha256,new.published_at) is distinct from (old.kind,old.version,old.content,old.content_sha256,old.published_at)) then
  raise exception 'ONAY: Yayınlanan belge değiştirilemez.';
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger policy_document_immutable before update or delete on policy_documents for each row execute function guard_policy_document();
create function public.guard_policy_acceptance() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op <> 'INSERT' then raise exception 'ONAY: Kabul kanıtı değiştirilemez.'; end if;
 if not exists(select 1 from policy_documents where id=new.document_id and status='published') then raise exception 'ONAY: Belge yayınlanmamış.'; end if;
 if new.scope_kind='community' and not exists(select 1 from communities where id=new.scope_id)
 or new.scope_kind='event' and not exists(select 1 from events where id=new.scope_id) then raise exception 'ONAY: Geçersiz kapsam.'; end if;
 new.accepted_at:=clock_timestamp(); return new;
end $$;
create trigger policy_acceptance_guard before insert or update or delete on policy_acceptances for each row execute function guard_policy_acceptance();
create function public.guard_policy_requirement() returns trigger language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from policy_documents where id=new.document_id and kind=new.kind and status='published') then raise exception 'ONAY: Geçersiz belge sürümü.'; end if; return new;
end $$;
create trigger policy_requirement_guard before insert or update on policy_requirements for each row execute function guard_policy_requirement();

create function public.submit_community_application(p_actor uuid,p_login text,p_request uuid,p_fields jsonb,p_document_ids uuid[]) returns uuid
language plpgsql security definer set search_path=public as $$
declare c communities; sid uuid; docs uuid[]; fingerprint text; prior uuid;
begin
 if p_actor is null or p_request is null or coalesce(char_length(p_login),0)=0 then raise exception 'YETKI: GitHub ile giriş gerekli.'; end if;
 perform lock_role_users(array[p_actor]);
 if p_fields is null or exists(select 1 from jsonb_object_keys(p_fields) k where k not in ('name','slug','university','city','link','contact_name','contact_email','contact_phone','previous_application_id'))
 or coalesce(char_length(btrim(p_fields->>'name')),0) not between 2 and 80
 or coalesce(p_fields->>'slug','') !~ '^[a-z0-9-]{3,40}$'
 or coalesce(char_length(btrim(p_fields->>'contact_name')),0) not between 2 and 120
 or coalesce(p_fields->>'contact_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or char_length(p_fields->>'contact_email')>254
 or coalesce(char_length(p_fields->>'contact_phone'),0) not between 3 and 32
 or coalesce(char_length(p_fields->>'university'),0)>160 or coalesce(char_length(p_fields->>'city'),0)>80
 or coalesce(char_length(p_fields->>'link'),0)>2048
 or (coalesce(p_fields->>'link','')<>'' and ((p_fields->>'link') !~ '^https://[^/@[:space:]]+([/?#]|$)' or split_part(substring(p_fields->>'link' from 9),'/',1) like '%@%'))
 then raise exception 'Başvuru bilgileri geçersiz.'; end if;
 fingerprint:=encode(sha256(convert_to(p_fields::text||coalesce(array_to_string((select array_agg(d order by d) from unnest(p_document_ids) d),','),''),'UTF8')),'hex');
 select * into c from communities where applicant_id=p_actor and application_request_id=p_request;
 if found then
  if c.application_fingerprint<>fingerprint then raise exception 'Aynı istek anahtarı farklı bilgilerle kullanılamaz.'; end if; return c.id;
 end if;
 if exists(select 1 from communities where applicant_id=p_actor and status='beklemede') then raise exception 'İncelenen bir başvurun zaten var.'; end if;
 if (select count(*) from communities where applicant_id=p_actor and created_at>clock_timestamp()-interval '24 hours')>=3 then raise exception '24 saatte en fazla 3 başvuru yapabilirsin.'; end if;
 perform 1 from policy_requirements where kind in ('platform','data_processing') order by kind for share;
 select array_agg(r.document_id order by r.document_id) into docs from policy_requirements r join policy_documents d on d.id=r.document_id and d.status='published' where r.kind in ('platform','data_processing');
 if cardinality(docs) is distinct from 2 or cardinality(p_document_ids) is distinct from 2
 or docs is distinct from (select array_agg(d order by d) from unnest(p_document_ids) d) then raise exception 'ONAY: Güncel iki belgeyi ayrı ayrı onaylamalısın.'; end if;
 prior:=nullif(p_fields->>'previous_application_id','')::uuid;
 if prior is not null and not exists(select 1 from communities where id=prior and applicant_id=p_actor and status='reddedildi') then raise exception 'YETKI: Önceki başvuru sana ait değil veya reddedilmemiş.'; end if;
 insert into communities(name,slug,university,city,link,contact_name,contact_email,contact_phone,applicant_id,previous_application_id,application_request_id,application_fingerprint)
 values(btrim(p_fields->>'name'),p_fields->>'slug',nullif(p_fields->>'university',''),nullif(p_fields->>'city',''),nullif(p_fields->>'link',''),btrim(p_fields->>'contact_name'),lower(p_fields->>'contact_email'),p_fields->>'contact_phone',p_actor,prior,p_request,fingerprint) returning * into c;
 insert into policy_subjects(user_id) values(p_actor) on conflict(user_id) do nothing;
 select id into sid from policy_subjects where user_id=p_actor;
 insert into policy_acceptances(subject_id,document_id,scope_kind,scope_id) select sid,d,'community',c.id from unnest(docs) d;
 insert into mail_outbox(dedupe_key,kind,community_id,recipient_email,payload) values('application:'||c.id,'application_received',c.id,c.contact_email,jsonb_build_object('name',c.name));
 perform log_admin(p_actor,p_login,'community_application_submitted',null,null,null,jsonb_build_object('community',c.id));
 return c.id;
end $$;
create function public.review_community_application(p_community uuid,p_actor uuid,p_login text,p_decision text,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare c communities; begin
 perform require_head_admin(p_actor);
 if p_decision not in ('onaylandi','reddedildi') or p_decision is null then raise exception 'Geçersiz karar.'; end if;
 if p_decision='reddedildi' then perform require_reason(p_reason); end if;
 select applicant_id into c.applicant_id from communities where id=p_community;
 perform lock_role_users(array[c.applicant_id]);
 select * into c from communities where id=p_community for update;
 if not found then raise exception 'Başvuru bulunamadı.'; end if;
 if c.status=p_decision then return; end if;
 if c.status<>'beklemede' or c.applicant_id is null then raise exception 'Bu başvuru artık incelenmiyor.'; end if;
 update communities set status=p_decision,reviewed_by=p_actor,reviewed_at=clock_timestamp(),review_reason=case when p_decision='reddedildi' then btrim(p_reason) end where id=c.id;
 if p_decision='onaylandi' then insert into community_members(community_id,user_id,github_login,role) values(c.id,c.applicant_id,coalesce((select a.actor_login from admin_audit a where a.action='community_application_submitted' and a.after->>'community'=c.id::text order by a.id limit 1),'başvuran'),'owner'); end if;
 insert into mail_outbox(dedupe_key,kind,community_id,recipient_email,payload)
 values('review:'||c.id,case when p_decision='onaylandi' then 'application_approved' else 'application_rejected' end,c.id,c.contact_email,jsonb_build_object('name',c.name,'slug',c.slug,'reason',case when p_decision='reddedildi' then btrim(p_reason) end));
 perform log_admin(p_actor,p_login,'community_application_reviewed',null,null,jsonb_build_object('community',c.id,'status',c.status),jsonb_build_object('community',c.id,'status',p_decision),p_reason);
end $$;

-- Yalnız sunucu okur; tüm yazma girişleri RPC üzerinden.
alter table policy_documents enable row level security;
alter table policy_subjects enable row level security;
alter table policy_requirements enable row level security;
alter table policy_acceptances enable row level security;
alter table mail_outbox enable row level security;
revoke all on policy_documents,policy_subjects,policy_requirements,policy_acceptances,mail_outbox from public,anon,authenticated,service_role;
grant select on policy_documents,policy_subjects,policy_requirements,policy_acceptances,mail_outbox to service_role;
revoke all on function lock_role_users(uuid[]),guard_policy_document(),guard_policy_acceptance(),guard_policy_requirement(),submit_community_application(uuid,text,uuid,jsonb,uuid[]),review_community_application(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function submit_community_application(uuid,text,uuid,jsonb,uuid[]),review_community_application(uuid,uuid,text,text,text) to service_role;
commit;
