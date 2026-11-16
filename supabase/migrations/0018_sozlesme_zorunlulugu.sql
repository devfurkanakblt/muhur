-- Plan 4 · Sözleşme zorunluluğunun aktivasyonu.
-- YALNIZCA Plan 4 uygulaması (…_with_terms ve accept_role_invite_with_policies çağıran sürüm) yayındayken
-- ve gerçek, yayınlanabilir belge metinleri publish_policy_document ile yayınlandıktan sonra uygulanır.
-- Eski uygulama yayındayken uygulanırsa kayıt/katılım/davet kabulü durur.
begin;

-- Üç belge türü de yayınlanmadan zorunluluk açılmaz; yönetim ve kayıt sessizce kapanmasın.
do $$
begin
  if (select count(*) from public.policy_requirements r join public.policy_documents d on d.id=r.document_id and d.status='published'
      where r.kind in ('platform','data_processing','participant')) <> 3 then
    raise exception '0018: platform, veri işleme ve katılımcı belgeleri yayınlanmadan sözleşme zorunluluğu açılamaz.';
  end if;
end $$;

-- 0017 ile bu migration arasında eski girişlerden eklenen üyelikler de legacy olarak işaretlenmiş olmalı (trigger);
-- yine de eksik kalan varsa burada tamamlanır. Kabul tarihi üretilmez.
insert into public.participant_enrollments(user_id,event_id,source)
  select distinct user_id,event_id,'legacy' from public.project_members on conflict do nothing;

-- Yönetim yazmaları onay ister; kayıtsız proje üyeliği reddedilir.
create or replace function public.policy_enforcement_enabled() returns boolean language sql stable set search_path=public as $$ select true $$;

-- Kabul denetimini atlatan eski girişler servis rolüne kapanır. Gövdeler (…_v0) yeni kapsayıcıların
-- definer iç yardımcısı olarak kalır; istemci ve servis doğrudan çağıramaz.
revoke execute on function
  public.register_project(uuid, uuid, text, text, text, text, text, bigint, text, text, text, text, text),
  public.join_project_by_code(text, uuid, text, text),
  public.accept_role_invite(uuid, text, text, text)
  from public, anon, authenticated, service_role;

commit;
