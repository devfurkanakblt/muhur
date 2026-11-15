-- Plan 4: 0018 aktivasyonu öncesi kalıcı kurulum (test veritabanı). Üç belge türü head admin ile yayınlanır;
-- 0018 bu koşul sağlanmadan uygulanamaz.
insert into auth.users(id) values('18000000-0000-0000-0000-000000000001');
insert into platform_roles(user_id,login,role) values('18000000-0000-0000-0000-000000000001','head','head_admin');
select publish_policy_document('18000000-0000-0000-0000-000000000001','head',
  create_policy_draft('18000000-0000-0000-0000-000000000001','head',k,'2026-11',E'Test metni\n'||k),null,'Test yayını')
from unnest(array['platform','data_processing','participant']) k;
