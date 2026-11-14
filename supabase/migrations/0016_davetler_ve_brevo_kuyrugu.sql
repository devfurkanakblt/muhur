-- Kapsamlı davetler, rol yarışları ve Brevo outbox işçisi. Önce 0015 uygulanır.
begin;
alter table events add column application_url text,add column rules_url text,add column privacy_url text;
create table role_invites (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('organizator','juri')),
 community_id uuid references communities(id),event_id uuid references events(id),token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 recipient_email text not null check(char_length(recipient_email)<=254),created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '7 days',revoked_at timestamptz,accepted_at timestamptz,accepted_by uuid references auth.users(id),
 request_id uuid not null,request_fingerprint text not null,unique(created_by,request_id),
 check((kind='organizator' and community_id is not null and event_id is null) or(kind='juri' and event_id is not null and community_id is null)),
 check((accepted_at is null)=(accepted_by is null))
);
alter table mail_outbox add foreign key(invite_id) references role_invites(id);
create table mail_events(id uuid primary key default gen_random_uuid(),dedupe_key text not null unique,message_id text not null,event text not null,occurred_at timestamptz not null,created_at timestamptz not null default clock_timestamp());
create index mail_events_message on mail_events(message_id);

create function require_community_manager(p_community uuid,p_actor uuid,p_owner_only boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare st text; r text; begin
 select status into st from communities where id=p_community for update;
 select role into r from community_members where community_id=p_community and user_id=p_actor;
 if st is null or r is null or(p_owner_only and r<>'owner') then raise exception 'YETKI: Bu toplulukta işlem yetkin yok.'; end if;
 if st='askida' then raise exception 'ASKIDA: Topluluk geçici olarak durduruldu.'; end if;
 if st<>'onaylandi' then raise exception 'YETKI: Topluluk henüz onaylanmadı.'; end if;
end $$;
create function assert_community_competitor_free(p_community uuid,p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform id from events where community_id=p_community order by id for share;
 if exists(select 1 from project_members m join events e on e.id=m.event_id where m.user_id=p_user and e.community_id=p_community and not is_locked(e.id)) then
  raise exception 'YARISAMAZ: Bu topluluğun açık etkinliğinde yarışıyorsun.';
 end if;
end $$;
-- Yönetim yolları yeni topluluk → etkinlik sırasını izler; rol değişimiyle ters kilit sırası kurulmaz.
create or replace function require_event_manager(p_event uuid,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare cid uuid; st text; sus timestamptz; begin
 select community_id into cid from events where id=p_event;
 select status into st from communities where id=cid for share;
 select suspended_at into sus from events where id=p_event for no key update;
 if p_actor is null or not exists(select 1 from community_members where community_id=cid and user_id=p_actor) then raise exception 'YETKI: Bu etkinliği yönetme yetkin yok.'; end if;
 if st='askida' or sus is not null then raise exception 'ASKIDA: Bu etkinlik platform tarafından geçici olarak durduruldu.'; end if;
end $$;

create function create_role_invite(p_actor uuid,p_login text,p_kind text,p_scope uuid,p_token_hash text,p_email text,p_mail_ciphertext text,p_request uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare cid uuid; c communities; ev events; prior role_invites; iid uuid; fp text; begin
 perform lock_role_users(array[p_actor]);
 if p_kind='organizator' then cid:=p_scope;
 elsif p_kind='juri' then select community_id into cid from events where id=p_scope;
 else raise exception 'Geçersiz davet türü.'; end if;
 perform require_community_manager(cid,p_actor,p_kind='organizator');
 select * into c from communities where id=cid;
 if p_kind='juri' then select * into ev from events where id=p_scope for share; if not found then raise exception 'Etkinlik bulunamadı.'; end if; if ev.suspended_at is not null then raise exception 'ASKIDA: Etkinlik durduruldu.'; end if; end if;
 if p_request is null or coalesce(p_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(p_email)>254
 or coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$' or coalesce(char_length(p_mail_ciphertext),0) not between 20 and 8192 then raise exception 'Davet bilgileri geçersiz.'; end if;
 fp:=encode(sha256(convert_to(p_kind||p_scope::text||lower(p_email),'UTF8')),'hex');
 select * into prior from role_invites where created_by=p_actor and request_id=p_request;
 if found then if fp<>prior.request_fingerprint then raise exception 'Aynı istek farklı davet için kullanılamaz.'; end if; return prior.id; end if;
 if(select count(*) from role_invites where coalesce(community_id,event_id)=p_scope and created_at>clock_timestamp()-interval '1 hour')>=20 then raise exception 'Saatlik 20 davet sınırına ulaşıldı.'; end if;
 if exists(select 1 from role_invites where kind=p_kind and coalesce(community_id,event_id)=p_scope and recipient_email=lower(p_email) and created_at>clock_timestamp()-interval '5 minutes') then raise exception 'Yeniden davet için 5 dakika bekle.'; end if;
 update role_invites set revoked_at=clock_timestamp() where kind=p_kind and coalesce(community_id,event_id)=p_scope and recipient_email=lower(p_email) and accepted_at is null and revoked_at is null;
 insert into role_invites(kind,community_id,event_id,token_hash,recipient_email,created_by,request_id,request_fingerprint)
 values(p_kind,case when p_kind='organizator' then p_scope end,case when p_kind='juri' then p_scope end,p_token_hash,lower(p_email),p_actor,p_request,fp) returning id into iid;
 insert into mail_outbox(dedupe_key,kind,community_id,event_id,invite_id,recipient_email,payload,secret_payload)
 values('invite:'||iid,case when p_kind='juri' then 'jury_invite' else 'organizer_invite' end,cid,ev.id,iid,lower(p_email),jsonb_build_object('name',coalesce(ev.title,c.name)),p_mail_ciphertext);
 perform log_admin(p_actor,p_login,'role_invite_created',ev.id,null,null,jsonb_build_object('invite',iid,'kind',p_kind,'community',cid));
 return iid;
end $$;

create function accept_role_invite(p_actor uuid,p_login text,p_provider text,p_token_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare inv role_invites; cid uuid; st text; creator_role text; ev events; begin
 if p_actor is null or p_provider not in ('github','linkedin') or p_provider is null or coalesce(char_length(p_login),0)=0 then raise exception 'YETKI: Doğrulanmış giriş gerekli.'; end if;
 perform lock_role_users(array[p_actor]);
 select * into inv from role_invites where token_hash=p_token_hash;
 if not found then raise exception 'Davet geçersiz veya süresi dolmuş.'; end if;
 if inv.kind='organizator' then cid:=inv.community_id; else select community_id into cid from events where id=inv.event_id; end if;
 select status into st from communities where id=cid for update;
 if inv.event_id is not null then select * into ev from events where id=inv.event_id for share; end if;
 select * into inv from role_invites where id=inv.id for update;
 if inv.accepted_at is not null then
  if inv.accepted_by=p_actor then return jsonb_build_object('kind',inv.kind,'community',cid,'event',inv.event_id,'alreadyAccepted',true); end if;
  raise exception 'Davet daha önce kullanılmış.';
 end if;
 if inv.revoked_at is not null or inv.expires_at<=clock_timestamp() then raise exception 'Davet geçersiz veya süresi dolmuş.'; end if;
 if st='askida' or ev.suspended_at is not null then raise exception 'ASKIDA: Bu davetin kapsamı durduruldu.'; end if;
 if st is distinct from 'onaylandi' then raise exception 'YETKI: Topluluk onaylı değil.'; end if;
 select role into creator_role from community_members where community_id=cid and user_id=inv.created_by;
 if creator_role is null or(inv.kind='organizator' and creator_role<>'owner') then raise exception 'Davet eden kişinin yetkisi sona ermiş.'; end if;
 if inv.kind='organizator' then
  if p_provider<>'github' then raise exception 'Organizatör daveti için GitHub ile giriş yap.'; end if;
  perform assert_community_competitor_free(cid,p_actor);
  insert into community_members(community_id,user_id,github_login,role) values(cid,p_actor,p_login,'organizator') on conflict(community_id,user_id) do nothing;
 else
  if exists(select 1 from project_members where event_id=inv.event_id and user_id=p_actor) then raise exception 'YARISAMAZ: Bu etkinlikte bir projenin üyesisin.'; end if;
  if exists(select 1 from community_members where community_id=cid and user_id=p_actor) then raise exception 'Bu etkinliği zaten topluluk rolünle inceleyebilirsin.'; end if;
  insert into event_jurors(event_id,user_id,login,provider) values(inv.event_id,p_actor,p_login,p_provider) on conflict(event_id,user_id) do nothing;
 end if;
 update role_invites set accepted_at=clock_timestamp(),accepted_by=p_actor where id=inv.id;
 update mail_outbox set state='cancelled',secret_payload=null where invite_id=inv.id and state='pending';
 perform log_admin(p_actor,p_login,'role_invite_accepted',inv.event_id,null,null,jsonb_build_object('invite',inv.id,'kind',inv.kind,'community',cid));
 return jsonb_build_object('kind',inv.kind,'community',cid,'event',inv.event_id,'alreadyAccepted',false);
end $$;

create function revoke_role_invite(p_actor uuid,p_login text,p_invite uuid) returns void language plpgsql security definer set search_path=public as $$
declare inv role_invites; cid uuid; begin
 select * into inv from role_invites where id=p_invite;
 if not found then raise exception 'Davet bulunamadı.'; end if;
 if inv.kind='organizator' then cid:=inv.community_id; else select community_id into cid from events where id=inv.event_id; end if;
 perform require_community_manager(cid,p_actor,inv.kind='organizator');
 select * into inv from role_invites where id=p_invite for update;
 if inv.accepted_at is not null then raise exception 'Kullanılmış davet iptal edilemez; üyeyi kaldır.'; end if;
 update role_invites set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_invite;
 update mail_outbox set state='cancelled',secret_payload=null where invite_id=p_invite and state='pending';
 perform log_admin(p_actor,p_login,'role_invite_revoked',inv.event_id,null,null,jsonb_build_object('invite',p_invite));
end $$;

create function remove_community_organizer(p_actor uuid,p_login text,p_community uuid,p_target uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform lock_role_users(array[p_target]); perform require_community_manager(p_community,p_actor,true);
 if not exists(select 1 from community_members where community_id=p_community and user_id=p_target and role='organizator') then raise exception 'Organizatör bulunamadı; sahip çıkarılamaz.'; end if;
 delete from community_members where community_id=p_community and user_id=p_target;
 perform log_admin(p_actor,p_login,'organizer_removed',null,null,null,jsonb_build_object('community',p_community,'user',p_target));
end $$;
create function remove_event_juror(p_actor uuid,p_login text,p_event uuid,p_target uuid) returns void language plpgsql security definer set search_path=public as $$
declare cid uuid; begin
 perform lock_role_users(array[p_target]); select community_id into cid from events where id=p_event;
 perform require_community_manager(cid,p_actor,false); perform require_event_manager(p_event,p_actor);
 delete from event_jurors where event_id=p_event and user_id=p_target;
 perform log_admin(p_actor,p_login,'juror_removed',p_event,null,null,jsonb_build_object('user',p_target));
end $$;
create function transfer_community_ownership(p_actor uuid,p_login text,p_community uuid,p_target uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform lock_role_users(array[p_actor,p_target]); perform require_community_manager(p_community,p_actor,true);
 if p_actor=p_target or not exists(select 1 from community_members where community_id=p_community and user_id=p_target and role='organizator') then raise exception 'Sahiplik mevcut bir organizatöre devredilebilir.'; end if;
 perform assert_community_competitor_free(p_community,p_target);
 update community_members set role='organizator' where community_id=p_community and user_id=p_actor;
 update community_members set role='owner' where community_id=p_community and user_id=p_target;
 perform log_admin(p_actor,p_login,'community_ownership_transferred',null,null,jsonb_build_object('community',p_community,'owner',p_actor),jsonb_build_object('community',p_community,'owner',p_target));
end $$;
create or replace function set_community_owner(p_community uuid,p_user uuid,p_login text,p_actor uuid,p_actor_login text,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare old_owner uuid; current_owner uuid; begin
 perform require_head_admin(p_actor); perform require_reason(p_reason);
 select user_id into old_owner from community_members where community_id=p_community and role='owner';
 perform lock_role_users(array[old_owner,p_user]);
 perform id from communities where id=p_community for update; if not found then raise exception 'Topluluk bulunamadı.'; end if;
 select user_id into current_owner from community_members where community_id=p_community and role='owner';
 if old_owner is distinct from current_owner then raise exception 'Sahip değişmiş; sayfayı yenile.'; end if;
 perform assert_community_competitor_free(p_community,p_user);
 update community_members set role='organizator' where community_id=p_community and role='owner' and user_id<>p_user;
 insert into community_members(community_id,user_id,github_login,role) values(p_community,p_user,p_login,'owner') on conflict(community_id,user_id) do update set role='owner',github_login=excluded.github_login;
 perform log_admin(p_actor,p_actor_login,'community_owner_set',null,null,jsonb_build_object('community',p_community,'owner',old_owner),jsonb_build_object('community',p_community,'owner',p_user),p_reason);
end $$;

-- Mail kuyruğunda lease kaybı belirsizdir: kör yeniden gönderim yapılmaz.
create function claim_mail_jobs(p_limit integer default 3) returns setof mail_outbox language plpgsql security definer set search_path=public as $$
begin
 update mail_outbox set state='uncertain',last_error='Gönderim lease süresi doldu; sağlayıcı sonucunu kontrol et.' where state='leased' and lease_until<clock_timestamp();
 update mail_outbox m set state='cancelled',secret_payload=null where state='pending' and invite_id is not null and exists(select 1 from role_invites i where i.id=m.invite_id and(i.revoked_at is not null or i.accepted_at is not null or i.expires_at<=clock_timestamp()));
 return query with jobs as(select id from mail_outbox where state='pending' and next_attempt_at<=clock_timestamp() order by next_attempt_at,created_at for update skip locked limit least(greatest(p_limit,1),10))
 update mail_outbox m set state='leased',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1 from jobs where m.id=jobs.id returning m.*;
end $$;
create function mail_job_ready(p_job uuid,p_token uuid) returns boolean language sql volatile security definer set search_path=public as $$
 select exists(select 1 from mail_outbox m where m.id=p_job and m.state='leased' and m.lease_token=p_token and m.lease_until>clock_timestamp()
 and(m.invite_id is null or exists(select 1 from role_invites i where i.id=m.invite_id and i.accepted_at is null and i.revoked_at is null and i.expires_at>clock_timestamp())))
$$;
create function finish_mail_job(p_job uuid,p_token uuid,p_state text,p_message_id text default null,p_error text default null,p_retry_after integer default 60) returns boolean language plpgsql security definer set search_path=public as $$
declare changed boolean; begin
 if p_state='accepted' and coalesce(char_length(p_message_id),0) not between 1 and 255 then raise exception 'Mesaj kimliği gerekli.'; end if;
 if p_state not in ('accepted','pending','uncertain','dead','cancelled') then raise exception 'Geçersiz e-posta durumu.'; end if;
 if p_state='accepted' then perform pg_advisory_xact_lock(hashtextextended('muhur-mail:'||p_message_id,0)); end if;
 update mail_outbox set state=case when p_state='pending' and attempts>=5 then 'dead' else p_state end,
 provider_message_id=case when p_state='accepted' then p_message_id else provider_message_id end,
 accepted_at=case when p_state='accepted' then clock_timestamp() else accepted_at end,
 next_attempt_at=clock_timestamp()+make_interval(secs=>least(greatest(p_retry_after,5),86400)),last_error=left(p_error,500),
 secret_payload=case when p_state in ('accepted','dead','cancelled') then null else secret_payload end,lease_until=null
 where id=p_job and lease_token=p_token and state='leased' and lease_until>clock_timestamp();
 changed:=found;
 -- Webhook HTTP yanıtından önce gelebilir; kaydedilmiş en güçlü olayı sonuca taşı.
 if changed and p_state='accepted' then
  update mail_outbox set delivery_state=coalesce((select case when event='delivered' then 'delivered' when event in ('hard_bounce','invalid') then 'bounced' when event in ('blocked','spam') then 'blocked' else 'sent' end from mail_events where message_id=p_message_id and event in ('delivered','hard_bounce','invalid','blocked','spam','request','sent') order by case when event='delivered' then 4 when event in ('hard_bounce','invalid','blocked','spam') then 3 else 1 end desc,occurred_at desc limit 1),delivery_state) where id=p_job;
 end if;
 return changed;
end $$;
create function record_mail_event(p_key text,p_message_id text,p_event text,p_occurred_at timestamptz) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer; d text; begin
 if p_event not in ('request','sent','delivered','soft_bounce','hard_bounce','blocked','invalid','error','deferred','spam') then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('muhur-mail:'||p_message_id,0));
 insert into mail_events(dedupe_key,message_id,event,occurred_at) values(p_key,p_message_id,p_event,p_occurred_at) on conflict(dedupe_key) do nothing;
 get diagnostics n=row_count; if n=0 then return false; end if;
 d:=case when p_event='delivered' then 'delivered' when p_event in ('hard_bounce','invalid') then 'bounced' when p_event in ('blocked','spam') then 'blocked' when p_event in ('request','sent') then 'sent' end;
 if d is not null then update mail_outbox set delivery_state=d where provider_message_id=p_message_id
 and case delivery_state when 'delivered' then 4 when 'bounced' then 3 when 'blocked' then 3 when 'sent' then 1 else 0 end < case d when 'delivered' then 4 when 'bounced' then 3 when 'blocked' then 3 else 1 end; end if;
 return true;
end $$;
create function retry_mail_job(p_actor uuid,p_login text,p_job uuid,p_confirm_uncertain boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare m mail_outbox; begin
 select * into m from mail_outbox where id=p_job; if not found then raise exception 'E-posta işi bulunamadı.'; end if;
 if not is_head_admin(p_actor) then perform require_community_manager(m.community_id,p_actor,false); end if;
 select * into m from mail_outbox where id=p_job for update;
 if m.state not in ('dead','uncertain') or(m.state='uncertain' and not p_confirm_uncertain) then raise exception 'Belirsiz gönderimi kontrol edip açıkça onaylamalısın.'; end if;
 if m.invite_id is not null then raise exception 'Davet için yeni bağlantı oluştur; eski e-postayı tekrar gönderme.'; end if;
 update mail_outbox set state='pending',next_attempt_at=clock_timestamp(),attempts=0,lease_token=null,last_error=null where id=p_job;
 perform log_admin(p_actor,p_login,'mail_retry',m.event_id,null,null,jsonb_build_object('mail',p_job,'previous_state',m.state));
end $$;

alter table role_invites enable row level security; alter table mail_events enable row level security;
revoke all on role_invites,mail_events from public,anon,authenticated,service_role;
grant select on role_invites,mail_events to service_role;
revoke insert,update,delete on communities,community_members,event_jurors from service_role;

create or replace function public.register_project(
  p_event uuid, p_user uuid, p_login text, p_avatar text, p_name text, p_team text,
  p_summary text, p_repo_id bigint, p_repo_name text, p_repo_url text, p_branch text,
  p_demo text default null, p_sha text default null
) returns public.projects language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_role_users(array[p_user]);
  perform public.assert_participant_writable(p_event);
  return public.register_project_v0(p_event, p_user, p_login, p_avatar, p_name, p_team, p_summary,
    p_repo_id, p_repo_name, p_repo_url, p_branch, p_demo, p_sha);
end $$;

create or replace function public.join_project_by_code(p_code text, p_user uuid, p_login text, p_avatar text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_role_users(array[p_user]);
  perform public.assert_participant_writable((select event_id from projects where invite_code = p_code));
  return public.join_project_by_code_v0(p_code, p_user, p_login, p_avatar);
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('require_community_manager','assert_community_competitor_free','create_role_invite','accept_role_invite','revoke_role_invite','remove_community_organizer','remove_event_juror','transfer_community_ownership','claim_mail_jobs','mail_job_ready','finish_mail_job','record_mail_event','retry_mail_job') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 if f.sig::text not like 'require_community_manager(%' and f.sig::text not like 'assert_community_competitor_free(%' then execute format('grant execute on function %s to service_role',f.sig); end if;
 end loop;
end $$;

create function public.safe_https_link(p_url text) returns boolean language sql immutable set search_path=public as $$
 select p_url is null or(p_url ~ '^https://[^/@[:space:]]+([/?#]|$)' and char_length(p_url)<=2048 and split_part(substring(p_url from 9),'/',1) not like '%@%')
$$;
create function admin_create_community_event(p_community uuid,p_title text,p_slug text,p_starts timestamptz,p_deadline timestamptz,p_actor uuid,p_login text,p_application_url text,p_rules_url text,p_privacy_url text) returns uuid
language plpgsql security definer set search_path=public as $$
declare eid uuid; cslug text; begin
 if not safe_https_link(p_application_url) or not safe_https_link(p_rules_url) or not safe_https_link(p_privacy_url) then raise exception 'Bağlantılar geçerli HTTPS adresleri olmalı.'; end if;
 select slug into cslug from communities where id=p_community;
 if cslug is distinct from 'deu-csai' and(p_rules_url is null or p_privacy_url is null) then raise exception 'Kurallar ve aydınlatma bağlantıları gerekli.'; end if;
 eid:=admin_create_event(p_community,p_title,p_slug,p_starts,p_deadline,p_actor,p_login);
 update events set application_url=p_application_url,rules_url=p_rules_url,privacy_url=p_privacy_url where id=eid;
 return eid;
end $$;
revoke all on function safe_https_link(text) from public,anon,authenticated,service_role;
revoke all on function admin_create_community_event(uuid,text,text,timestamptz,timestamptz,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function admin_create_community_event(uuid,text,text,timestamptz,timestamptz,uuid,text,text,text,text) to service_role;

commit;
