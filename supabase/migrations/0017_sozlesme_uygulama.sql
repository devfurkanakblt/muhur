-- Plan 4 · Sözleşme sürümleri, yeniden onay ve katılımcı kaydı (additive hazırlık).
-- Önce 0015/0016 uygulanır. Eski uygulama bu migration'dan sonra da çalışır:
--  * register_project / join_project_by_code / accept_role_invite girişleri açık kalır (0018 kapatır),
--  * yönetim yazmalarındaki onay denetimi policy_enforcement_enabled()=false olduğu için etkisizdir (0018 açar),
--  * yeni kapsayıcılar (…_with_terms, accept_role_invite_with_policies) ise aktivasyondan önce de açık onay ister.
-- Geçmiş kullanıcılara sahte kabul tarihi yazılmaz; eski üyelikler `legacy` kaynağıyla ayrı işaretlenir.
begin;

-- Zorunluluk anahtarı: yalnız migration değiştirir (0018 → true). Uygulama okuyabilir, değiştiremez.
create function public.policy_enforcement_enabled() returns boolean language sql stable set search_path=public as $$ select false $$;

-- Belgeler -------------------------------------------------------------------------------------
-- Taslak yayınlanana kadar düzenlenebilir; yayınlanan/emekli belge değişmez, silinmez, geri yayınlanmaz.
-- Taslaktan yayına geçiş yalnız publish_policy_document içinden (işlem yerel bayrağıyla) yapılır.
create or replace function public.guard_policy_document() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' then
  if old.status<>'draft' then raise exception 'ONAY: Yayınlanan belge değiştirilemez.'; end if;
  return old;
 end if;
 if old.status<>'draft' and (new.status='draft' or (new.kind,new.version,new.content,new.content_sha256,new.published_at) is distinct from (old.kind,old.version,old.content,old.content_sha256,old.published_at)) then
  raise exception 'ONAY: Yayınlanan belge değiştirilemez.';
 end if;
 if old.status='retired' and new.status<>'retired' then raise exception 'ONAY: Emekli belge yeniden yayınlanamaz.'; end if;
 if old.status='draft' and new.status<>'draft' and coalesce(current_setting('muhur.policy_publish',true),'')<>'on' then
  raise exception 'ONAY: Belge yalnız denetimli yayın işlemiyle yayınlanır.';
 end if;
 return new;
end $$;

alter table public.policy_requirements add column activated_at timestamptz not null default clock_timestamp();
alter table public.policy_subjects add column detached_at timestamptz;

-- Kabul kanıtı: belge türü ile kapsam eşleşir (platform/veri işleme → topluluk, katılımcı → etkinlik).
create or replace function public.guard_policy_acceptance() returns trigger language plpgsql set search_path=public as $$
declare k text; begin
 if tg_op <> 'INSERT' then raise exception 'ONAY: Kabul kanıtı değiştirilemez.'; end if;
 select kind into k from policy_documents where id=new.document_id and status='published';
 if k is null then raise exception 'ONAY: Belge yayınlanmamış.'; end if;
 if (k='participant') <> (new.scope_kind='event') then raise exception 'ONAY: Belge türü bu kapsamda kabul edilemez.'; end if;
 if new.scope_kind='community' and not exists(select 1 from communities where id=new.scope_id)
 or new.scope_kind='event' and not exists(select 1 from events where id=new.scope_id) then raise exception 'ONAY: Geçersiz kapsam.'; end if;
 new.accepted_at:=clock_timestamp(); return new;
end $$;

-- Etkinlik kuralları ---------------------------------------------------------------------------
-- Harici sayfaların içeriği sunucudan indirilmez (SSRF yok); kanıt, o an kabul edilen URL ve sürümdür.
-- content_sha256 yalnız topluluk sabit içerik sunduysa doludur; aksi hâlde doğrulanmış gibi gösterilmez.
create table public.event_terms_versions(
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id),
 version integer not null check(version>=1),
 rules_url text not null check(public.safe_https_link(rules_url)),
 privacy_url text not null check(public.safe_https_link(privacy_url)),
 content_sha256 text check(content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(event_id,version), unique(id,event_id)
);
alter table public.events add column current_terms_version_id uuid,
 add constraint events_current_terms_own foreign key(current_terms_version_id,id) references public.event_terms_versions(id,event_id);

create table public.event_terms_acceptances(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 event_id uuid not null references public.events(id),
 terms_version_id uuid not null,
 accepted_at timestamptz not null default clock_timestamp(),
 unique(user_id,event_id,terms_version_id),
 foreign key(terms_version_id,event_id) references public.event_terms_versions(id,event_id)
);

-- Etkinliğe ilk kayıt: proje üyeliğinin yerine geçmez; ekipten ayrılmak kaydı silmez.
create table public.participant_enrollments(
 user_id uuid not null references auth.users(id),
 event_id uuid not null references public.events(id),
 source text not null check(source in ('accepted','legacy')),
 participant_document_id uuid references public.policy_documents(id),
 event_terms_version_id uuid,
 participant_acceptance_id uuid references public.policy_acceptances(id),
 terms_acceptance_id uuid references public.event_terms_acceptances(id),
 accepted_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,event_id),
 foreign key(event_terms_version_id,event_id) references public.event_terms_versions(id,event_id),
 check((source='legacy' and participant_document_id is null and event_terms_version_id is null and participant_acceptance_id is null and terms_acceptance_id is null and accepted_at is null)
  or (source='accepted' and participant_document_id is not null and event_terms_version_id is not null and participant_acceptance_id is not null and terms_acceptance_id is not null and accepted_at is not null))
);
create index participant_enrollments_event on public.participant_enrollments(event_id);

create function public.guard_append_only() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'ONAY: Kabul kanıtı değiştirilemez.'; end $$;
create trigger event_terms_versions_immutable before update or delete on event_terms_versions for each row execute function guard_append_only();
create trigger event_terms_acceptances_immutable before update or delete on event_terms_acceptances for each row execute function guard_append_only();
create trigger participant_enrollments_immutable before update or delete on participant_enrollments for each row execute function guard_append_only();

-- Kural işaretçisi: ilk sürüm her zaman kurulabilir (kilit öncesi); var olan sürüm başlangıçtan ya da ilk
-- katılımcı kaydından sonra değiştirilemez. Böylece aynı etkinlikte farklı kurala tabi ekipler oluşmaz.
create function public.guard_event_terms_pointer() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.current_terms_version_id is not distinct from old.current_terms_version_id then return new; end if;
 if new.current_terms_version_id is null then raise exception 'ONAY: Etkinlik kuralları kaldırılamaz.'; end if;
 if old.locked_at is not null or clock_timestamp()>=old.deadline then raise exception 'LOCKED: Kilit sonrası kurallar değiştirilemez.'; end if;
 if old.current_terms_version_id is not null and (clock_timestamp()>=old.starts_at
  or exists(select 1 from participant_enrollments where event_id=old.id)
  or exists(select 1 from project_members where event_id=old.id)) then
  raise exception 'ONAY: Etkinlik başladıktan veya ilk katılımcı kaydından sonra kurallar değiştirilemez.';
 end if;
 return new;
end $$;

-- Plan 3 bağlantıları ilk sürüme taşınır; eksik bağlantıya sahte metin konmaz.
insert into event_terms_versions(event_id,version,rules_url,privacy_url)
 select id,1,rules_url,privacy_url from events where rules_url is not null and privacy_url is not null;
update events e set current_terms_version_id=t.id from event_terms_versions t where t.event_id=e.id and t.version=1;
-- Trigger backfill'den sonra kurulur: geçmiş (kilitli) etkinliklerin bağlantıları da ilk sürüme taşınır.
create trigger events_terms_pointer before update of current_terms_version_id on events for each row execute function guard_event_terms_pointer();

-- Geçmiş üyelikler: kabul kanıtı değil, yalnızca "bu kişi bu etkinliğe önceden katılmıştı" işareti.
insert into participant_enrollments(user_id,event_id,source) select distinct user_id,event_id,'legacy' from project_members on conflict do nothing;

-- Proje üyeliği her zaman bir etkinlik kaydına dayanır. Zorunluluk kapalıyken (eski uygulama yayında)
-- kayıtsız ekleme `legacy` işaretlenir; açıkken reddedilir — eski girişler kabul denetimini atlatamaz.
create function public.guard_member_enrollment() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from participant_enrollments where user_id=new.user_id and event_id=new.event_id) then
  if policy_enforcement_enabled() then raise exception 'ONAY: Etkinlik koşulları onaylanmadan katılım yapılamaz.'; end if;
  insert into participant_enrollments(user_id,event_id,source) values(new.user_id,new.event_id,'legacy') on conflict do nothing;
 end if;
 return new;
end $$;
create trigger members_zz_enrollment_guard before insert on project_members for each row execute function guard_member_enrollment();

-- Belge taslağı ve yayın ---------------------------------------------------------------------
-- Metin uygulamada NFC + LF olarak normalleştirilir; SQL aynı kuralı denetler ve hash'i kendisi hesaplar.
create function public.create_policy_draft(p_actor uuid,p_login text,p_kind text,p_version text,p_content text) returns uuid
language plpgsql security definer set search_path=public as $$
declare d policy_documents; begin
 perform require_head_admin(p_actor);
 if p_kind not in ('platform','data_processing','participant') or p_kind is null then raise exception 'Geçersiz belge türü.'; end if;
 if coalesce(p_version,'') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$' then raise exception 'Sürüm 1-40 harf, rakam, nokta, alt çizgi veya tire olmalı.'; end if;
 if coalesce(char_length(p_content),0) not between 1 and 200000 then raise exception 'Belge metni boş olamaz ve 200000 karakteri aşamaz.'; end if;
 if p_content <> normalize(p_content,NFC) or position(E'\r' in p_content)>0 then raise exception 'Belge metni NFC ve LF satır sonlarıyla normalleştirilmeli.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('muhur-policy:'||p_kind,0));
 select * into d from policy_documents where kind=p_kind and version=p_version for update;
 if found then
  if d.status<>'draft' then raise exception 'Bu sürüm yayınlanmış; yeni bir sürüm numarası kullan.'; end if;
  update policy_documents set content=p_content,content_sha256=encode(sha256(convert_to(p_content,'UTF8')),'hex') where id=d.id;
 else
  insert into policy_documents(kind,version,content,content_sha256) values(p_kind,p_version,p_content,encode(sha256(convert_to(p_content,'UTF8')),'hex')) returning * into d;
 end if;
 perform log_admin(p_actor,p_login,'policy_draft_saved',null,null,null,jsonb_build_object('document',d.id,'kind',p_kind,'version',p_version,'sha256',encode(sha256(convert_to(p_content,'UTF8')),'hex')));
 return d.id;
end $$;

-- Taslağı yayınlar ve türün geçerli sürüm işaretçisini aynı transaction'da değiştirir. Önceki sürüm emekliye ayrılır;
-- metni, adresi ve eski kabuller kalır. Beklenen mevcut sürüm tutmazsa (eşzamanlı yayın) reddedilir.
create function public.publish_policy_document(p_actor uuid,p_login text,p_document uuid,p_expected_current uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare d policy_documents; cur uuid; begin
 perform require_head_admin(p_actor); perform require_reason(p_reason);
 select * into d from policy_documents where id=p_document;
 if not found then raise exception 'Belge bulunamadı.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('muhur-policy:'||d.kind,0));
 select document_id into cur from policy_requirements where kind=d.kind for update;
 select * into d from policy_documents where id=p_document for update;
 if cur is not distinct from d.id and d.status='published' then return; end if;
 if cur is distinct from p_expected_current then raise exception 'ONAY: Yayındaki sürüm değişmiş; sayfayı yenile.'; end if;
 if d.status<>'draft' then raise exception 'Yalnız taslak belge yayınlanabilir.'; end if;
 if d.content <> normalize(d.content,NFC) or position(E'\r' in d.content)>0 then raise exception 'Belge metni normalleştirilmemiş.'; end if;
 perform set_config('muhur.policy_publish','on',true);
 update policy_documents set status='published',published_at=clock_timestamp() where id=d.id;
 if cur is not null then update policy_documents set status='retired' where id=cur; end if;
 perform set_config('muhur.policy_publish','off',true);
 insert into policy_requirements(kind,document_id,activated_at) values(d.kind,d.id,clock_timestamp())
 on conflict(kind) do update set document_id=excluded.document_id,activated_at=excluded.activated_at;
 perform log_admin(p_actor,p_login,'policy_published',null,null,jsonb_build_object('kind',d.kind,'document',cur),
  jsonb_build_object('kind',d.kind,'document',d.id,'version',d.version,'sha256',d.content_sha256),p_reason);
end $$;

-- Yönetim onayı --------------------------------------------------------------------------------
create function public.management_policy_documents() returns table(id uuid,kind text,version text)
language sql stable security definer set search_path=public as $$
 select d.id,d.kind,d.version from policy_requirements r join policy_documents d on d.id=r.document_id and d.status='published'
 where r.kind in ('platform','data_processing') order by r.kind
$$;
-- Yan etkisiz: aktörün bu topluluk adına henüz kabul etmediği güncel yönetim belgeleri.
create function public.missing_management_policies(p_actor uuid,p_community uuid) returns table(id uuid,kind text,version text)
language sql stable security definer set search_path=public as $$
 select m.id,m.kind,m.version from management_policy_documents() m
 where not exists(select 1 from policy_acceptances a join policy_subjects s on s.id=a.subject_id
  where s.user_id=p_actor and a.document_id=m.id and a.scope_kind='community' and a.scope_id=p_community)
$$;
-- Yönetim yazmalarının ortak kapısı. Rol/askı denetiminden SONRA çağrılır; böylece ONAY hatası rol bilgisini
-- rolü olmayana açmaz. Belge işaretçisi FOR SHARE: yayın (FOR UPDATE) süren yazma bitene kadar bekler.
create function public.assert_management_policies(p_actor uuid,p_community uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not policy_enforcement_enabled() then return; end if;
 perform 1 from policy_requirements where kind in ('platform','data_processing') order by kind for share;
 if (select count(*) from management_policy_documents())<>2 then raise exception 'ONAY: Platform belgeleri yayınlanmadı; yönetim işlemleri geçici olarak kapalı.'; end if;
 if exists(select 1 from missing_management_policies(p_actor,p_community)) then
  raise exception 'ONAY: Güncel platform belgelerini topluluk adına onaylaman gerekiyor.';
 end if;
end $$;

create function public.insert_management_acceptances(p_actor uuid,p_community uuid,p_document_ids uuid[]) returns void
language plpgsql security definer set search_path=public as $$
declare docs uuid[]; given uuid[]; sid uuid; begin
 perform 1 from policy_requirements where kind in ('platform','data_processing') order by kind for share;
 select array_agg(id order by id) into docs from management_policy_documents();
 if cardinality(docs) is distinct from 2 then raise exception 'ONAY: Platform belgeleri henüz yayınlanmadı.'; end if;
 select array_agg(distinct x order by x) into given from unnest(p_document_ids) x;
 if given is distinct from docs then raise exception 'ONAY: Belgelerin yeni sürümü yayınlandı; sayfayı yenileyip güncel metni onayla.'; end if;
 insert into policy_subjects(user_id) values(p_actor) on conflict(user_id) do nothing;
 select id into sid from policy_subjects where user_id=p_actor;
 insert into policy_acceptances(subject_id,document_id,scope_kind,scope_id) select sid,d,'community',p_community from unnest(docs) d on conflict do nothing;
end $$;

-- Sahip/organizatör güncel belge setini topluluk adına onaylar. Askıdaki toplulukta da açıktır (onay vermek yazma sayılmaz).
create function public.accept_management_policies(p_actor uuid,p_login text,p_community uuid,p_document_ids uuid[]) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_actor is null then raise exception 'YETKI: Giriş gerekli.'; end if;
 perform lock_role_users(array[p_actor]);
 if not exists(select 1 from community_members where community_id=p_community and user_id=p_actor) then raise exception 'YETKI: Bu toplulukta işlem yetkin yok.'; end if;
 perform insert_management_acceptances(p_actor,p_community,p_document_ids);
 perform log_admin(p_actor,p_login,'management_policies_accepted',null,null,null,jsonb_build_object('community',p_community,'documents',(select jsonb_agg(x order by x) from unnest(p_document_ids) x)));
end $$;

-- Organizatör daveti: rol ve belge kabulü tek transaction. Belgeler henüz yayınlanmadıysa ve zorunluluk kapalıysa
-- rol eski davranışla kurulur; zorunluluk açıkken yapılandırma eksikliği açık hata verir.
create function public.accept_role_invite_with_policies(p_actor uuid,p_login text,p_provider text,p_token_hash text,p_document_ids uuid[]) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
 result:=accept_role_invite(p_actor,p_login,p_provider,p_token_hash);
 if result->>'kind'='organizator' then
  if (select count(*) from management_policy_documents())=2 then
   perform insert_management_acceptances(p_actor,(result->>'community')::uuid,p_document_ids);
  elsif policy_enforcement_enabled() then
   raise exception 'ONAY: Platform belgeleri yayınlanmadı; organizatör daveti geçici olarak kabul edilemiyor.';
  end if;
 end if;
 return result;
end $$;

-- Yönetim kapıları: mevcut rol/askı denetimine onay denetimi eklenir (gövdeler 0016 ile aynı).
create or replace function require_community_manager(p_community uuid,p_actor uuid,p_owner_only boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare st text; r text; begin
 select status into st from communities where id=p_community for update;
 select role into r from community_members where community_id=p_community and user_id=p_actor;
 if st is null or r is null or(p_owner_only and r<>'owner') then raise exception 'YETKI: Bu toplulukta işlem yetkin yok.'; end if;
 if st='askida' then raise exception 'ASKIDA: Topluluk geçici olarak durduruldu.'; end if;
 if st<>'onaylandi' then raise exception 'YETKI: Topluluk henüz onaylanmadı.'; end if;
 perform assert_management_policies(p_actor,p_community);
end $$;
create or replace function require_event_manager(p_event uuid,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare cid uuid; st text; sus timestamptz; begin
 select community_id into cid from events where id=p_event;
 select status into st from communities where id=cid for share;
 select suspended_at into sus from events where id=p_event for no key update;
 if p_actor is null or not exists(select 1 from community_members where community_id=cid and user_id=p_actor) then raise exception 'YETKI: Bu etkinliği yönetme yetkin yok.'; end if;
 if st='askida' or sus is not null then raise exception 'ASKIDA: Bu etkinlik platform tarafından geçici olarak durduruldu.'; end if;
 perform assert_management_policies(p_actor,cid);
end $$;
create or replace function public.admin_create_event(p_community uuid, p_title text, p_slug text, p_starts timestamptz,
  p_deadline timestamptz, p_actor uuid, p_login text)
returns uuid language plpgsql security definer set search_path = public as $$
declare st text; new_id uuid;
begin
  select status into st from communities where id = p_community for share;
  if not found or p_actor is null or not exists(select 1 from community_members
      where community_id = p_community and user_id = p_actor and role in ('owner', 'organizator')) then
    raise exception 'YETKI: Bu toplulukta etkinlik oluşturma yetkin yok.' using errcode = 'P0001';
  end if;
  if st = 'askida' then raise exception 'ASKIDA: Bu topluluk platform tarafından geçici olarak durduruldu.' using errcode = 'P0001'; end if;
  if st <> 'onaylandi' then raise exception 'YETKI: Bu toplulukta etkinlik oluşturma yetkin yok.' using errcode = 'P0001'; end if;
  perform public.assert_management_policies(p_actor, p_community);
  if p_title is null or char_length(p_title) not between 3 and 80
    or p_slug is null or p_slug !~ '^[a-z0-9-]{3,40}$'
    or p_starts is null or p_deadline is null
    or p_starts >= p_deadline or p_deadline <= clock_timestamp() then
    raise exception 'Etkinlik bilgileri geçersiz.' using errcode = 'P0001';
  end if;
  insert into events(title, slug, starts_at, deadline, community_id)
  values (p_title, p_slug, p_starts, p_deadline, p_community)
  returning id into new_id;
  perform public.log_admin(p_actor, p_login, 'event_created', new_id, null, null,
    jsonb_build_object('title', p_title, 'slug', p_slug, 'starts_at', p_starts, 'deadline', p_deadline, 'community', p_community));
  return new_id;
end $$;

-- Yeni etkinliğin ilk kural sürümü oluşturma transaction'ında kurulur.
create or replace function admin_create_community_event(p_community uuid,p_title text,p_slug text,p_starts timestamptz,p_deadline timestamptz,p_actor uuid,p_login text,p_application_url text,p_rules_url text,p_privacy_url text) returns uuid
language plpgsql security definer set search_path=public as $$
declare eid uuid; cslug text; tid uuid; begin
 if not safe_https_link(p_application_url) or not safe_https_link(p_rules_url) or not safe_https_link(p_privacy_url) then raise exception 'Bağlantılar geçerli HTTPS adresleri olmalı.'; end if;
 select slug into cslug from communities where id=p_community;
 if cslug is distinct from 'deu-csai' and(p_rules_url is null or p_privacy_url is null) then raise exception 'Kurallar ve aydınlatma bağlantıları gerekli.'; end if;
 eid:=admin_create_event(p_community,p_title,p_slug,p_starts,p_deadline,p_actor,p_login);
 update events set application_url=p_application_url,rules_url=p_rules_url,privacy_url=p_privacy_url where id=eid;
 if p_rules_url is not null and p_privacy_url is not null then
  insert into event_terms_versions(event_id,version,rules_url,privacy_url,created_by) values(eid,1,p_rules_url,p_privacy_url,p_actor) returning id into tid;
  update events set current_terms_version_id=tid where id=eid;
 end if;
 return eid;
end $$;

-- Etkinlik yöneticisi yeni (değişmez) kural sürümü ekler ve işaretçiyi değiştirir. Beklenen sürüm tutmazsa reddedilir.
create function public.set_event_terms(p_actor uuid,p_login text,p_event uuid,p_expected_version uuid,p_rules_url text,p_privacy_url text,p_content_sha256 text) returns uuid
language plpgsql security definer set search_path=public as $$
declare ev events; tid uuid; n integer; begin
 perform require_event_manager(p_event,p_actor);
 select * into ev from events where id=p_event;
 if not found then raise exception 'Etkinlik bulunamadı.'; end if;
 if is_locked(p_event) then raise exception 'LOCKED: Kilit sonrası kurallar değiştirilemez.'; end if;
 if ev.current_terms_version_id is distinct from p_expected_version then raise exception 'ONAY: Etkinlik kuralları başka bir yönetici tarafından değiştirildi; sayfayı yenile.'; end if;
 if p_rules_url is null or p_privacy_url is null or not safe_https_link(p_rules_url) or not safe_https_link(p_privacy_url) then raise exception 'Kurallar ve aydınlatma metni geçerli HTTPS adresleri olmalı.'; end if;
 if p_content_sha256 is not null and p_content_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'İçerik özeti 64 karakterlik SHA-256 olmalı.'; end if;
 select coalesce(max(version),0)+1 into n from event_terms_versions where event_id=p_event;
 insert into event_terms_versions(event_id,version,rules_url,privacy_url,content_sha256,created_by) values(p_event,n,p_rules_url,p_privacy_url,p_content_sha256,p_actor) returning id into tid;
 update events set current_terms_version_id=tid,rules_url=p_rules_url,privacy_url=p_privacy_url where id=p_event;
 perform log_admin(p_actor,p_login,'event_terms_set',p_event,null,jsonb_build_object('terms',ev.current_terms_version_id),jsonb_build_object('terms',tid,'version',n,'rules_url',p_rules_url,'privacy_url',p_privacy_url,'content_sha256',p_content_sha256));
 return tid;
end $$;

-- Katılımcı kaydı ------------------------------------------------------------------------------
-- Etkinliğe ilk kayıtta iki ayrı kabul (katılımcı koşulları + etkinlik kuralları) ve enrollment.
-- Var olan enrollment yeniden kullanılır (idempotent); yeni belge sürümü mevcut kaydı/teslimi engellemez.
-- Çağıran, kullanıcı kilidini (lock_role_users) ve etkinlik satırının FOR SHARE kilidini tutar.
create function public.ensure_participant_enrollment(p_event uuid,p_user uuid,p_document uuid,p_terms_version uuid) returns void
language plpgsql security definer set search_path=public as $$
declare doc uuid; tv uuid; sid uuid; pa uuid; ta uuid; begin
 if exists(select 1 from participant_enrollments where user_id=p_user and event_id=p_event) then return; end if;
 if p_document is null or p_terms_version is null then raise exception 'ONAY: Katılımcı koşullarını ve etkinlik kurallarını ayrı ayrı onaylamalısın.'; end if;
 perform 1 from policy_requirements where kind='participant' for share;
 select r.document_id into doc from policy_requirements r join policy_documents d on d.id=r.document_id and d.status='published' where r.kind='participant';
 if doc is null then raise exception 'ONAY: Katılımcı koşulları henüz yayınlanmadı; kayıt geçici olarak kapalı.'; end if;
 select current_terms_version_id into tv from events where id=p_event;
 if tv is null then raise exception 'ONAY: Bu etkinliğin kuralları henüz yayınlanmadı; organizatöre haber ver.'; end if;
 if doc<>p_document or tv<>p_terms_version then raise exception 'ONAY: Koşulların yeni sürümü yayınlandı; sayfayı yenileyip güncel metni onayla.'; end if;
 insert into policy_subjects(user_id) values(p_user) on conflict(user_id) do nothing;
 select id into sid from policy_subjects where user_id=p_user;
 insert into policy_acceptances(subject_id,document_id,scope_kind,scope_id) values(sid,doc,'event',p_event) on conflict do nothing;
 select id into pa from policy_acceptances where subject_id=sid and document_id=doc and scope_kind='event' and scope_id=p_event;
 insert into event_terms_acceptances(user_id,event_id,terms_version_id) values(p_user,p_event,tv) on conflict do nothing;
 select id into ta from event_terms_acceptances where user_id=p_user and event_id=p_event and terms_version_id=tv;
 insert into participant_enrollments(user_id,event_id,source,participant_document_id,event_terms_version_id,participant_acceptance_id,terms_acceptance_id,accepted_at)
 values(p_user,p_event,'accepted',doc,tv,pa,ta,clock_timestamp());
end $$;

create function public.register_project_with_terms(
  p_event uuid, p_user uuid, p_login text, p_avatar text, p_name text, p_team text,
  p_summary text, p_repo_id bigint, p_repo_name text, p_repo_url text, p_branch text,
  p_demo text, p_sha text, p_document uuid, p_terms_version uuid
) returns public.projects language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_role_users(array[p_user]);
  perform public.assert_participant_writable(p_event);
  perform id from events where id = p_event for share;
  if not found or public.is_locked(p_event) then raise exception 'LOCKED: Teslim kapalı.'; end if;
  perform public.assert_can_compete(p_event, p_user);
  perform public.ensure_participant_enrollment(p_event, p_user, p_document, p_terms_version);
  return public.register_project_v0(p_event, p_user, p_login, p_avatar, p_name, p_team, p_summary,
    p_repo_id, p_repo_name, p_repo_url, p_branch, p_demo, p_sha);
end $$;

create function public.join_project_with_terms(p_code text, p_actor uuid, p_login text, p_avatar text, p_document uuid, p_terms_version uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare ev uuid;
begin
  if p_code is null or p_code !~ '^[a-f0-9]{18}$' then raise exception 'TEAM: Davet bağlantısı geçersiz ya da yenilenmiş.'; end if;
  select event_id into ev from projects where invite_code = p_code;
  if ev is null then raise exception 'TEAM: Davet bağlantısı geçersiz ya da yenilenmiş.'; end if;
  perform public.lock_role_users(array[p_actor]);
  perform public.assert_participant_writable(ev);
  perform id from events where id = ev for share;
  if not found or public.is_locked(ev) then raise exception 'LOCKED: Teslim kapalı.'; end if;
  perform public.assert_can_compete(ev, p_actor);
  perform public.ensure_participant_enrollment(ev, p_actor, p_document, p_terms_version);
  return public.join_project_by_code_v0(p_code, p_actor, p_login, p_avatar);
end $$;

-- Anonimleştirme: profil/iletişim verisi temizlenir; sözleşme kanıtı (acceptance.subject_id) sabit kalır,
-- yalnız kişi ↔ özne eşlemesi kontrollü ayrılır. Kanıt silinmez, güncellenmez.
create or replace function public.anonymize_user(p_user uuid, p_actor uuid, p_login text, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform public.require_head_admin(p_actor);
  n := public.anonymize_user_v0(p_user, p_actor, p_login, p_reason);
  update policy_subjects set user_id = null, detached_at = clock_timestamp() where user_id = p_user;
  return n;
end $$;

-- Erişim: tablolar yalnız sunucu tarafından okunur; bütün yazmalar RPC'lerden geçer.
alter table event_terms_versions enable row level security;
alter table event_terms_acceptances enable row level security;
alter table participant_enrollments enable row level security;
revoke all on event_terms_versions,event_terms_acceptances,participant_enrollments from public,anon,authenticated,service_role;
grant select on event_terms_versions,event_terms_acceptances,participant_enrollments to service_role;

revoke all on function policy_enforcement_enabled(),guard_append_only(),guard_event_terms_pointer(),guard_member_enrollment(),
 create_policy_draft(uuid,text,text,text,text),publish_policy_document(uuid,text,uuid,uuid,text),
 management_policy_documents(),missing_management_policies(uuid,uuid),assert_management_policies(uuid,uuid),
 insert_management_acceptances(uuid,uuid,uuid[]),accept_management_policies(uuid,text,uuid,uuid[]),
 accept_role_invite_with_policies(uuid,text,text,text,uuid[]),set_event_terms(uuid,text,uuid,uuid,text,text,text),
 ensure_participant_enrollment(uuid,uuid,uuid,uuid),
 register_project_with_terms(uuid,uuid,text,text,text,text,text,bigint,text,text,text,text,text,uuid,uuid),
 join_project_with_terms(text,uuid,text,text,uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function policy_enforcement_enabled(),create_policy_draft(uuid,text,text,text,text),publish_policy_document(uuid,text,uuid,uuid,text),
 management_policy_documents(),missing_management_policies(uuid,uuid),accept_management_policies(uuid,text,uuid,uuid[]),
 accept_role_invite_with_policies(uuid,text,text,text,uuid[]),set_event_terms(uuid,text,uuid,uuid,text,text,text),
 register_project_with_terms(uuid,uuid,text,text,text,text,text,bigint,text,text,text,text,text,uuid,uuid),
 join_project_with_terms(text,uuid,text,text,uuid,uuid)
 to service_role;

commit;
