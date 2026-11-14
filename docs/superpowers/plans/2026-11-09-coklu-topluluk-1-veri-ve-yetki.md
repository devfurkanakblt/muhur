# Çoklu topluluk · Plan 1: Veri modeli, roller ve yetki ayrımı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Topluluk, üyelik, platform rolü, jüri ve askı kavramlarını veritabanına eklemek ve her yönetim yetkisini etkinlik/topluluk kapsamına bağlamak. Mevcut tek-etkinlik arayüzü (`is_current`) bu planda aynen çalışmaya devam eder.

**Architecture:** Tek migration `0012_topluluklar.sql`. Mevcut RPC'lerin gövdeleri kopyalanmaz: her fonksiyon `_v0` adıyla yeniden adlandırılır, aynı imzalı yeni bir sarmalayıcı önce kapsam/askı/yarışma kontrolünü yapar sonra `_v0`'ı çağırır. Uygulama tarafında saf karar fonksiyonu `lib/authz.ts` (birim testli) + sunucu yardımcısı `lib/access.ts`; `viewer.isAdmin` kaldırılır.

**Tech Stack:** Next.js 16 App Router (yazmadan önce `node_modules/next/dist/docs/` ilgili rehberi okunur), Supabase Postgres, `node --test` + yerel PostgreSQL (`npm run test:db`).

**Spec:** `docs/superpowers/specs/2026-11-09-coklu-topluluk-design.md` (uygulama sırasının 1. ve 2. adımı). Sonraki planlar: Plan 2 adresler+ana sayfa, Plan 3 başvuru/davet/LinkedIn/e-posta, Plan 4 sözleşme kayıtları, Plan 5 marka+30 gün saklama.

## Global Constraints

- Migration geriye uyumlu olmalı: canlı DB'ye uygulanınca **eski uygulama kodu** (bu dal merge edilmeden önce) çalışmaya devam eder. Bu yüzden RPC imzaları ve dönüş tipleri değişmez; `events.community_id` bu planda NOT NULL yapılmaz (Plan 2).
- Hata önekleri: `YETKI:` (rol yok), `ASKIDA:` (etkinlik ya da topluluk askıda), `YARISAMAZ:` (organizatör/sahip/jüri yarışamaz). Uygulama bunları Türkçe mesaja çevirir:
  - `ASKIDA:` → "Bu etkinlik platform tarafından geçici olarak durduruldu."
  - `YARISAMAZ:` → "Bu etkinlikte organizatör ya da jürisin; yarışmaya katılamazsın."
  - `YETKI:` → "Yetkisiz"
- Head admin kilit atamaz, ödül veremez, zaman/duyuru/oylama değiştiremez; inceleyebilir, askıya alabilir, anonimleştirebilir.
- Askıda: katılımcı yazmaları ve yeni kuyruk girişi reddedilir; **zaten kuyruktaki işler işlenir**; cron kilidi (`lock_delivery_event`) askıdan etkilenmez.
- Yönetim işlemleri `log_admin` ile aynı transaction'da kayda girer.
- Geri alınamaz işlemler mevcut 12 saatlik taze oturum kuralını korur (`requireFreshAdmin` → yeni adıyla da).
- DEÜ CS&AI topluluğunun slug'ı: `deu-csai`. Telegram yalnızca `communities.telegram_enabled = true` olan topluluğun etkinliklerinde gider (seed'de yalnızca `deu-csai`).
- Kodda Türkçe yorum ve isimlendirme düzeni korunur.

## Review Focus

1. **Topluluklar arası çapraz istek:** A topluluğunun organizatörü, B'nin etkinlik id'si / ödül id'si / proje id'siyle doğrudan RPC ya da `/api/arsiv/<id>`, `/api/juri/<slug>` çağırır → reddedilmeli. (Task 3 SQL testi + Task 6 rota testi.)
2. **Askı anında kuyrukta bekleyen teslim:** askıdan önce `enqueue_submission` ile girmiş iş `claim/complete` ile kabul edilmeli; askıdan sonra yeni `enqueue_submission` reddedilmeli. (Task 2.)
3. **Askıdayken süre dolması:** `lock_delivery_event(p, 'cron', false)` askıdaki etkinliği de kilitlemeli. (Task 3.)
4. **Organizatörün kendi etkinliğinde ekibe katılma girişimi** hem `register_project` hem `join_project_by_code` yolundan reddedilmeli; başka topluluğun etkinliğinde serbest. (Task 2.)
5. **`ADMIN_GITHUB_IDS` değiştirilmesi** artık yetki vermemeli; `bootstrap_head_admin` ikinci kez çağrılınca etkisiz kalmalı. (Task 1 + Task 5.)

---

## Dosya haritası

- Create `supabase/migrations/0012_topluluklar.sql` — tüm şema + fonksiyonlar (Task 1–3 sırayla ekler).
- Create `tests/database-tenancy.sql` — DB kural testleri (Task 1–3 bölüm bölüm).
- Modify `scripts/test-db.mjs` — migration listesine `0011_bayat_teslim_hatasi.sql`, `0012_topluluklar.sql`; test listesine `tests/database-tenancy.sql`; `auth.identities` tablosu yok, eklenmez.
- Create `lib/authz.ts` — saf yetki kararları. Test: `tests/authz.test.mjs`.
- Create `lib/access.ts` — `server-only`; DB'den erişim okuma, `requireEventAction`.
- Modify `lib/data.ts`, `lib/identity.ts`, `lib/env.ts`, `tests/identity.test.mjs`.
- Modify çağrı yerleri: `app/actions.ts`, `app/yonetim/page.tsx`, `app/api/arsiv/[id]/route.ts`, `app/api/juri/[slug]/route.ts`, `lib/certificate-access.ts`, `app/maskot/actions.ts`, `lib/mascot-naming.ts`, `components/site-header.tsx`, `lib/status.ts`, `lib/delivery-policy.ts`, `tests/delivery.test.mjs`.
- Modify `lib/notify.ts` (+ çağıranlar `lib/freeze.ts`, `lib/reminders.ts`, `lib/winners.ts`, `app/actions.ts`), `tests/notify.test.mjs`.
- Create `components/suspension-notice.tsx`.

---

### Task 1: Şema, seed ve rol yardımcıları

**Files:**
- Create: `supabase/migrations/0012_topluluklar.sql`
- Create: `tests/database-tenancy.sql`
- Modify: `scripts/test-db.mjs` (migration ve test listeleri)

**Interfaces — Produces (SQL):**
- Tablo `communities(id uuid pk, slug text unique check '^[a-z0-9-]{3,40}$', name text 2..80, university text, city text, link text, status text check in ('beklemede','onaylandi','reddedildi','askida') default 'beklemede', contact_name text, contact_email text, contact_phone text, applicant_id uuid references auth.users, review_reason text, reviewed_by uuid, reviewed_at timestamptz, suspended_reason text, telegram_enabled boolean not null default false, created_at timestamptz default now())`
- Tablo `community_members(community_id uuid fk on delete cascade, user_id uuid fk auth.users, github_login text not null, role text check in ('owner','organizator'), joined_at timestamptz default now(), primary key(community_id,user_id))` + `unique index community_one_owner on community_members(community_id) where role='owner'`
- Tablo `platform_roles(user_id uuid pk fk auth.users, login text not null, role text check (role='head_admin'), created_at timestamptz default now())`
- Tablo `event_jurors(event_id uuid fk events, user_id uuid fk auth.users, login text not null, provider text check in ('github','linkedin'), joined_at timestamptz default now(), primary key(event_id,user_id))`
- `events` yeni sütunlar: `community_id uuid references communities(id)` (nullable), `suspended_at timestamptz`, `suspended_reason text check (len<=500)`, `suspended_by uuid`
- `is_head_admin(p_user uuid) returns boolean`
- `event_role(p_event uuid, p_user uuid) returns text` → `'owner' | 'organizator' | 'juri' | null` (topluluk rolü jüriden önce gelir)
- `bootstrap_head_admin(p_user uuid, p_login text) returns boolean` — head admin yoksa ekler, `deu-csai` topluluğunun sahibi yapar, `log_admin` yazar, `true` döner; zaten head admin varsa hiçbir şey yapmaz, `false` döner.
- Tüm yeni tablolar: RLS açık, `anon, authenticated`'dan revoke, `service_role`'a grant. Fonksiyonlar `security definer set search_path = public`, yalnızca `service_role`'a execute.
- Seed: `communities` içine `('deu-csai','DEÜ CS&AI','Dokuz Eylül Üniversitesi','İzmir', status 'onaylandi', telegram_enabled true)`; `update events set community_id = <deu> where community_id is null`.

- [ ] **Step 1: Failing test yaz** — `tests/database-tenancy.sql`, `tests/database-hardening.sql` başındaki `pg_temp.assert_true` / `pg_temp.expect_error` yardımcılarıyla, `begin; … rollback;` içinde:

```sql
-- Bölüm 1 · şema ve roller
select pg_temp.assert_true((select count(*) = 0 from events where community_id is null), 'Tüm mevcut etkinlikler bir topluluğa bağlı');
select pg_temp.assert_true((select status = 'onaylandi' and telegram_enabled from communities where slug = 'deu-csai'), 'DEÜ CS&AI onaylı ve Telegram açık');
-- kullanıcılar: 50..01 head admin adayı, 50..02 DEÜ organizatörü, 50..03 B topluluğu sahibi, 50..04 jüri, 50..05 katılımcı
select pg_temp.assert_true(public.bootstrap_head_admin('50000000-0000-0000-0000-000000000001', 'bas'), 'İlk bootstrap head admin atar');
select pg_temp.assert_true(not public.bootstrap_head_admin('50000000-0000-0000-0000-000000000005', 'saldirgan'), 'İkinci bootstrap etkisiz');
select pg_temp.assert_true(public.is_head_admin('50000000-0000-0000-0000-000000000001') and not public.is_head_admin('50000000-0000-0000-0000-000000000005'), 'Head admin yalnızca bootstrap edilen');
select pg_temp.assert_true(public.event_role(<deu etkinliği>, '50000000-0000-0000-0000-000000000001') = 'owner', 'Bootstrap edilen DEÜ sahibi olur');
select pg_temp.assert_true(public.event_role(<B etkinliği>, '50000000-0000-0000-0000-000000000002') is null, 'DEÜ organizatörünün B etkinliğinde rolü yok');
select pg_temp.assert_true(public.event_role(<B etkinliği>, '50000000-0000-0000-0000-000000000004') = 'juri', 'Jüri yalnızca davetli olduğu etkinlikte');
select pg_temp.expect_error($c$ insert into community_members(community_id,user_id,github_login,role) select id,'50000000-0000-0000-0000-000000000002','x','owner' from communities where slug='deu-csai' $c$, 'community_one_owner', 'Toplulukta ikinci sahip olamaz');
```
Kurulum kısmı: 5 kullanıcı, B topluluğu (`b-topluluk`, onaylandi, sahip 50..03), DEÜ'ye 50..02 organizatör, her topluluğa bir açık etkinlik (`is_current=false`, B etkinliği için `community_id` B), 50..04 B etkinliğinin jürisi. Bu kurulum tablosu sonraki bölümlerde de kullanılır; etkinlik id'lerini sabit yaz (`60000000-…-01` DEÜ, `…-02` B).

- [ ] **Step 2: Fail olduğunu gör** — `scripts/test-db.mjs` listelerine `0011_bayat_teslim_hatasi.sql`, `0012_topluluklar.sql` ve `tests/database-tenancy.sql` eklendikten sonra `npm run test:db` → `0012_topluluklar.sql` bulunamadığı için FAIL.

- [ ] **Step 3: Migration'ı yaz** — Interfaces bloğundaki şema, seed ve üç fonksiyon; `begin; … commit;` içinde.

- [ ] **Step 4: Geç** — `npm run test:db` → "Veritabanı kural testleri geçti." ve tenancy PASS satırları.

- [ ] **Step 5: Commit** — `git add supabase/migrations/0012_topluluklar.sql tests/database-tenancy.sql scripts/test-db.mjs && git commit -m "Topluluk, platform rolü ve jüri şeması"`

---

### Task 2: Katılımcı tarafı — askı ve yarışma yasağı

**Files:** Modify `supabase/migrations/0012_topluluklar.sql`, `tests/database-tenancy.sql`

**Interfaces:**
- Consumes: `event_role`, `events.suspended_at`
- Produces (SQL):
  - `assert_participant_writable(p_event uuid) returns void` — etkinlik `suspended_at is not null` ise `ASKIDA:` fırlatır. (Topluluğun askıda olması katılımcıyı **durdurmaz**; spec.)
  - `assert_can_compete(p_event uuid, p_user uuid) returns void` — `event_role` null değilse `YARISAMAZ:`.
  - Trigger `members_competition_guard before insert on project_members` → `assert_can_compete(new.event_id, new.user_id)`. (`new.event_id` `guard_members` tarafından doldurulduğundan trigger adı alfabetik olarak `members_guard`'dan sonra gelmeli: `members_zz_competition_guard`.)
  - Trigger `votes_tenancy_guard before insert on votes` → `assert_participant_writable(new.event_id)`; `event_role(new.event_id,new.user_id) = 'juri'` ise `YARISAMAZ:`.
  - Yeniden adlandır + sarmala (imza ve dönüş tipi aynı, grant'lar yeniden verilir): `register_project`, `join_project_by_code`, `leave_project`, `update_project`, `withdraw_project`, `remove_member`, `renew_invite`, `transfer_project_owner`, `enqueue_submission`, `claim_mystery`. Sarmalayıcı etkinliği bulur (parametreden ya da `projects.event_id`/davet kodundan) ve `assert_participant_writable` çağırır, sonra `_v0`'a devreder. `_v0` fonksiyonlarından `service_role` dahil herkesin execute yetkisi alınır.

- [ ] **Step 1: Failing testler** (bölüm 2):

```sql
-- yarışma yasağı
select pg_temp.expect_error($c$ select public.register_project('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','org',null,'Org Proje','Org Ekip','Organizatör kayıt denemesi.',901,'o/r','https://github.com/o/r','main',null,null) $c$, 'YARISAMAZ', 'Organizatör kendi topluluğunun etkinliğine kayıt olamaz');
select pg_temp.expect_error(<B etkinliğinde 50..04 jürinin join_project_by_code çağrısı>, 'YARISAMAZ', 'Jüri kendi etkinliğinde ekibe katılamaz');
select pg_temp.expect_error(<B etkinliğinde 50..03 sahibin register_project çağrısı>, 'YARISAMAZ', 'Topluluk sahibi kendi etkinliğine kayıt olamaz');
select pg_temp.assert_true(<50..02 (DEÜ organizatörü) B etkinliğine register_project başarıyla döner>, 'Organizatör başka topluluğun etkinliğinde yarışabilir');
select pg_temp.expect_error(<50..04 jüri, B etkinliğinde votes insert>, 'YARISAMAZ', 'Jüri kendi etkinliğinde oy veremez');
-- askı: kuyruktaki iş işlenir, yeni giriş reddedilir
-- (B etkinliğinde 50..05 projesi register_project ile p_sha verilerek kaydedilir → bir submit işi kuyrukta)
update events set suspended_at = clock_timestamp(), suspended_reason = 'test' where id = '60000000-0000-0000-0000-000000000002';
select pg_temp.expect_error(<50..05 enqueue_submission yeni sha>, 'ASKIDA', 'Askıda yeni teslim kuyruğa giremez');
select pg_temp.expect_error(<50..05 update_project>, 'ASKIDA', 'Askıda proje düzenlenemez');
select pg_temp.expect_error(<başka kullanıcı join_project_by_code>, 'ASKIDA', 'Askıda ekibe katılınamaz');
select pg_temp.assert_true((select count(*) = 1 from public.claim_delivery_jobs(<proje>, 1)), 'Askıdan önce kuyruğa giren iş alınabilir');
select pg_temp.assert_true(public.complete_submission(<job>, <token>, 'teslim/x.zip', repeat('a',64), 10) is not null, 'Askıdan önceki teslim kabul edilir');
update events set suspended_at = null, suspended_reason = null where id = '60000000-0000-0000-0000-000000000002';
```
`complete_submission` dönüş tipini `0006_son_dakika.sql`'den kontrol et ve assertion'ı ona göre yaz.

- [ ] **Step 2:** `npm run test:db` → FAIL (`YARISAMAZ` beklenirken işlem kabul edildi).
- [ ] **Step 3:** Interfaces'teki fonksiyon, trigger ve sarmalayıcıları migration'a ekle.
- [ ] **Step 4:** `npm run test:db` → tüm bölümler PASS; mevcut `tests/database*.sql` dosyaları da geçmeli (sarmalayıcı davranışı bozmadı).
- [ ] **Step 5: Commit** — "Askıda katılımcı yazmaları ve organizatör/jüri yarışma yasağı"

---

### Task 3: Yönetim tarafı — kapsamlı yönetim RPC'leri ve askıya alma

**Files:** Modify `supabase/migrations/0012_topluluklar.sql`, `tests/database-tenancy.sql`

**Interfaces — Produces (SQL):**
- `require_event_manager(p_event uuid, p_actor uuid) returns void` — `event_role ∉ ('owner','organizator')` → `YETKI:`; etkinlik `suspended_at` dolu ya da topluluk `status='askida'` → `ASKIDA:`. Head admin bu kontrolü geçemez (rolü yoksa `YETKI:`).
- Yeniden adlandır + sarmala, ilk satırda `require_event_manager`: `admin_update_event(p_event…)`, `admin_lock_event(p_event…)`, `admin_add_award(p_event…)`, `admin_remove_award(p_award, p_event…)`, `admin_switch_event(p_current…)`. `admin_switch_event` sarmalayıcısı `_v0` döndükten sonra yeni etkinliğin `community_id`'sini `p_current`'ınkiyle doldurur.
- `anonymize_user` sarmalayıcısı: `is_head_admin(p_actor)` değilse `YETKI:`.
- `suspend_event(p_event uuid, p_actor uuid, p_login text, p_reason text) returns void` / `unsuspend_event(p_event uuid, p_actor uuid, p_login text, p_reason text) returns void` — yalnızca head admin; gerekçe 3..500 karakter zorunlu; `log_admin(…,'event_suspended'|'event_unsuspended', p_event, null, before, after, p_reason)`.
- `suspend_community(p_community uuid, p_actor uuid, p_login text, p_reason text)` / `unsuspend_community(…)` — yalnızca head admin; `status` `onaylandi ↔ askida`; `log_admin(…,'community_suspended'|'community_unsuspended', null, null, jsonb_build_object('community', id), …)`.
- `set_community_owner(p_community uuid, p_user uuid, p_login text, p_actor uuid, p_actor_login text, p_reason text)` — yalnızca head admin; eski sahibi `organizator` yapar, hedefi `owner` yapar (yoksa ekler); kayıt yazar. (Spec: sahip hesabını kaybederse.)

- [ ] **Step 1: Failing testler** (bölüm 3):

```sql
select pg_temp.expect_error($c$ select public.admin_lock_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','org') $c$, 'YETKI', 'DEÜ organizatörü B etkinliğini kilitleyemez');
select pg_temp.expect_error(<50..02 admin_add_award B etkinliği>, 'YETKI', 'Başka topluluğa ödül verilemez');
select pg_temp.expect_error(<50..02 admin_remove_award, B ödül id + DEÜ etkinlik id>, …) -- ödül B'ye ait, p_event DEÜ: false döner, satır silinmez
select pg_temp.assert_true(<B ödülü hâlâ duruyor>, 'Yanlış etkinlik id ile başka topluluğun ödülü silinemez');
select pg_temp.expect_error(<50..01 head admin admin_update_event B etkinliği deadline>, 'YETKI', 'Head admin etkinlik zamanını değiştiremez');
select pg_temp.expect_error(<50..02 suspend_event>, 'YETKI', 'Organizatör askıya alamaz');
select public.suspend_event('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','bas','Kural ihlali incelemesi');
select pg_temp.expect_error(<50..03 B sahibi admin_update_event duyuru>, 'ASKIDA', 'Askıdaki etkinlikte organizatör de yönetemez');
select pg_temp.assert_true(public.lock_delivery_event('60000000-0000-0000-0000-000000000002','cron',true), 'Askıdaki etkinlik kilitlenebilir (süre işler)');
select pg_temp.assert_true((select count(*) = 1 from admin_audit where action = 'event_suspended' and reason = 'Kural ihlali incelemesi'), 'Askı gerekçesiyle kayda girer');
select public.suspend_community(<B>, '50000000-0000-0000-0000-000000000001','bas','Topluluk incelemesi');
select pg_temp.expect_error(<50..03 admin_switch_event B>, 'ASKIDA', 'Askıdaki topluluk yeni etkinlik açamaz');
select pg_temp.expect_error(<50..02 anonymize_user>, 'YETKI', 'Organizatör anonimleştiremez');
select pg_temp.assert_true(<50..02 admin_switch_event DEÜ → yeni etkinliğin community_id = deu>, 'Yeni etkinlik aynı topluluğa bağlanır');
select pg_temp.expect_error(<suspend_event gerekçe ''>, 'gerekçe', 'Gerekçesiz askı reddedilir');
```
Not: `lock_delivery_event` kilit testi askıdaki etkinliği kalıcı kilitler; bu bölümü dosyanın sonuna koy ya da ayrı etkinlik kullan.

- [ ] **Step 2:** `npm run test:db` → FAIL.
- [ ] **Step 3:** Migration'a ekle.
- [ ] **Step 4:** `npm run test:db` → PASS. `scripts/test-db.mjs` içindeki eşzamanlılık testleri `admin_update_event(…, null, 'admin', …)` gibi `p_actor = null` ile çağırıyor; bu çağrılar artık `YETKI:` alır. O testlerde, kurdukları etkinliği bir topluluğa bağlayıp aktörü o topluluğun organizatörü olarak geçecek şekilde güncelle (davranış testi aynı kalır).
- [ ] **Step 5: Commit** — "Yönetim RPC'leri etkinlik kapsamına bağlandı; askıya alma"

---

### Task 4: Saf yetki kararları

**Files:** Create `lib/authz.ts`, `tests/authz.test.mjs`

**Interfaces — Produces:**
```ts
export type CommunityRole = "owner" | "organizator";
export type EventAccess = {
  headAdmin: boolean;
  communityRole: CommunityRole | null;
  juror: boolean;
  eventSuspended: boolean;
  communitySuspended: boolean;
  locked: boolean;
};
export type EventAction = "yonet" | "isletim" | "incele" | "juri-paketi" | "askiya-al" | "anonimlestir";
export function can(access: EventAccess | null, action: EventAction): boolean;
export function denialMessage(access: EventAccess | null, action: EventAction): string; // "Yetkisiz" | "Bu etkinlik platform tarafından geçici olarak durduruldu."
```
Kurallar: `yonet` = communityRole && !eventSuspended && !communitySuspended. `isletim` (teslim yeniden deneme, işçi tetikleme, mühür yeniden deneme) = headAdmin || communityRole. `incele` = headAdmin || communityRole (askıda da). `juri-paketi` = incele || (juror && locked). `askiya-al`, `anonimlestir` = headAdmin.

- [ ] **Step 1: Test yaz** — her eylem için tablo testi; özellikle:
```js
assert.equal(can({ ...none, headAdmin: true }, "yonet"), false);            // head admin kilit/ödül yapamaz
assert.equal(can({ ...none, headAdmin: true }, "isletim"), true);
assert.equal(can({ ...none, communityRole: "organizator", eventSuspended: true }, "yonet"), false);
assert.equal(can({ ...none, communityRole: "organizator", eventSuspended: true }, "incele"), true);
assert.equal(can({ ...none, juror: true, locked: false }, "juri-paketi"), false);
assert.equal(can({ ...none, juror: true, locked: true }, "juri-paketi"), true);
assert.equal(can(null, "incele"), false);
assert.equal(denialMessage({ ...none, communityRole: "owner", communitySuspended: true }, "yonet"), "Bu etkinlik platform tarafından geçici olarak durduruldu.");
```
- [ ] **Step 2:** `npm test` → FAIL (modül yok).
- [ ] **Step 3:** `lib/authz.ts` yaz (bağımlılıksız, `server-only` değil).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — "Saf yetki kararları (lib/authz)"

---

### Task 5: Viewer, EventState ve sunucu erişim yardımcısı

**Files:** Modify `lib/data.ts`, `lib/identity.ts`, `lib/env.ts`, `tests/identity.test.mjs`; Create `lib/access.ts`

**Interfaces:**
- Consumes: Task 4 `EventAccess`, `can`, `denialMessage`; Task 1 tabloları.
- Produces:
  - `Viewer` tipinde `isAdmin` **kaldırılır**, yerine `isHeadAdmin: boolean` (DB `platform_roles`'tan, `getViewer` içinde tek sorgu).
  - `EventState`'e: `communityId: string | null`, `communityName: string | null`, `communityStatus: string | null`, `telegram: boolean`, `suspended: boolean`, `suspendedReason: string | null`. `getEvent`/`getEventBySlug`/`getEvents` `select("*, community:communities(name,status,telegram_enabled)")` ile okur.
  - `lib/access.ts` (`import "server-only"`):
    - `getEventAccess(viewer: Viewer | null, event: EventState): Promise<EventAccess | null>` — `react` `cache` ile; viewer yoksa null.
    - `requireEventAction(event: EventState, action: EventAction): Promise<Viewer>` — izin yoksa `denialMessage` ile `Error` fırlatır.
  - `getAdminSession()`: `viewer?.isAdmin` koşulu kaldırılır; viewer varsa çalışır (tazelik rolden bağımsız).
  - `lib/identity.ts`'ten `isAdminIdentity` silinir; `lib/env.ts`'ten `adminGithubIds` silinir (yalnızca Task 9'daki bootstrap betiği `process.env.ADMIN_GITHUB_IDS`'i doğrudan okur).

- [ ] **Step 1:** `tests/identity.test.mjs` — `isAdminIdentity` testlerini kaldır; A01 özelliğini koruyan yeni test: `githubIdentity` `user_metadata`'yı yok sayar (mevcut ilk testin kimlik assertion'ları kalır).
- [ ] **Step 2:** `npm test` → yeşil kalmalı ama `tsc` henüz kırık; `npx tsc --noEmit` → `isAdmin` kullanılan her yer hata verir. Bu liste Task 6'nın kapsamıdır.
- [ ] **Step 3:** Interfaces'teki değişiklikleri uygula.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — "Viewer head admin rolünü DB'den okur; etkinlik erişim yardımcısı" (tsc Task 6 sonunda yeşile döner; bu iki task art arda yapılır.)

---

### Task 6: Yetki çağrı yerlerini kapsamlı kontrole geçir

**Files:** `app/actions.ts`, `app/yonetim/page.tsx`, `app/api/arsiv/[id]/route.ts`, `app/api/juri/[slug]/route.ts`, `lib/certificate-access.ts`, `app/maskot/actions.ts`, `lib/mascot-naming.ts`, `app/maskot/naming-experience.tsx`, `components/site-header.tsx`, `lib/status.ts`, `lib/delivery-policy.ts`, `tests/delivery.test.mjs`

**Interfaces:**
- Consumes: `requireEventAction`, `getEventAccess`, `can`.
- Produces: `canDownloadArchive(viewer: { id: string } | null, memberIds: string[], canInspect: boolean): boolean`.

Eşleme:
| Yer | Yeni kontrol |
|---|---|
| `app/actions.ts` `requireAdmin()` | `requireManager(event)` → `requireEventAction(event, "yonet")`; yönetim action'ları (`setSchedule`, `setAnnouncement`, `setActivity`, `lockNowAction`, `setVoting`, `createEvent`, `addAward`, `removeAward`) `getEvent()` ile güncel etkinliği alıp bunu çağırır. `retryFreeze`, `runWorker`, `retryDeliveryJob` → `requireEventAction(event, "isletim")`; `retryDeliveryJob` işin `event_id`'sini okuyup o etkinlik için denetler. `requireFreshAdmin` → `requireFreshManager(event)` (aynı tazelik kuralı). |
| `anonymizeUser` | `requireEventAction(event, "anonimlestir")` + tazelik |
| DB hata eşlemesi (`app/actions.ts:28` civarı) | `ASKIDA`, `YARISAMAZ`, `YETKI` önekleri Global Constraints'teki mesajlara |
| `app/yonetim/page.tsx` | `incele` yoksa `notFound()`; `yonet` yoksa yönetim formları yerine "Salt okunur: bu etkinliği yönetme yetkin yok ya da etkinlik askıda." satırı, projeler/arşivler görünür kalır |
| `app/api/arsiv/[id]` | Projenin `event_id`'si okunur, o etkinlik için `getEventAccess`; `canDownloadArchive(viewer, members, can(access,"incele"))` |
| `app/api/juri/[slug]` | `can(access, "juri-paketi")` |
| `lib/certificate-access.ts` | `viewer.isAdmin` → `can(access, "incele")` |
| `app/maskot/actions.ts`, `lib/mascot-naming.ts` (`isAdmin` alanı → `canManage`) | `yonet` |
| `components/site-header.tsx` | "Yönetim" bağlantısı `can(access, "incele")` ise |
| `lib/status.ts` | `adminState` `incele` ise; `delivery_jobs` sorgusuna `.eq("event_id", event.id)` eklenir (bugün tüm etkinliklerin işlerini okuyor) |

- [ ] **Step 1:** `tests/delivery.test.mjs` canDownloadArchive testlerini yeni imzaya çevir: `(null, ["o"], true) → false`, `({id:"v"}, ["o"], false) → false`, `({id:"o"}, ["o"], false) → true`, `({id:"a"}, [], true) → true`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Tablodaki değişiklikleri uygula.
- [ ] **Step 4:** `npm run check` → test + lint + `tsc` hepsi yeşil; `grep -rn "isAdmin" app components lib` → yalnızca `isHeadAdmin` eşleşmeleri.
- [ ] **Step 5:** `npm run test:routes` ve `npm run test:browser` mevcut senaryolarla geçmeli (yönetim sayfası head admin + DEÜ sahibi olarak açılır). Geçmezse senaryolardaki yönetici kurulumunu `platform_roles` + `community_members` ile güncelle.
- [ ] **Step 6: Commit** — "Yönetim yetkileri etkinlik kapsamında denetlenir"

---

### Task 7: Telegram yalnızca izinli topluluklarda

**Files:** `lib/notify.ts`, `lib/freeze.ts`, `lib/reminders.ts`, `lib/winners.ts`, `app/actions.ts`, `tests/notify.test.mjs`

**Interfaces — Produces:** `notifyEvent(event: Pick<EventState, "telegram">, lines: string[], sticker?: StickerId, options?: { photo?: string }): Promise<boolean>` — `event.telegram` false ise ağa çıkmadan `false` döner, aksi halde `notify`. Tüm etkinlik bağlamlı çağrılar (`lib/freeze.ts:71`, `lib/reminders.ts:26`, `lib/winners.ts:62,74,75`, `app/actions.ts:155,503,523,569`) `notifyEvent`'e geçer; çağıranın elinde etkinlik yoksa (winners) imzaya `event` parametresi eklenir.

- [ ] **Step 1:** Test: `telegram()` taklidiyle `notifyEvent({ telegram: false }, ["x"])` → `false` ve `calls.length === 0`; `notifyEvent({ telegram: true }, ["x"])` → `true`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Uygula.
- [ ] **Step 4:** `npm run check` → PASS; `grep -rn "[^a-zA-Z]notify(" app lib | grep -v lib/notify.ts` → boş.
- [ ] **Step 5: Commit** — "Telegram bildirimleri yalnızca Telegram'ı açık toplulukların etkinliklerinde"

---

### Task 8: Askı görünürlüğü ve head admin askı düğmeleri

**Files:** Create `components/suspension-notice.tsx`; Modify `app/page.tsx`, `app/panel/page.tsx`, `app/sergi/[slug]/page.tsx`, `app/yonetim/page.tsx`, `app/actions.ts`

**Interfaces:**
- `SuspensionNotice({ event, showReason }: { event: EventState; showReason: boolean })` — `event.suspended` değilse `null`. Metin: "Bu etkinlik platform tarafından geçici olarak durduruldu." `showReason` ise altında "Gerekçe: …" (yalnızca `incele` yetkisi olanlara). DESIGN.md: `--danger` değil `--ink` metin + `--rule-strong` çizgi; indigo kullanılmaz.
- Server actions: `suspendEvent(_: FormState, formData)`, `unsuspendEvent(_: FormState, formData)` — `requireEventAction(event, "askiya-al")` + taze oturum; `gerekce` alanı zorunlu; RPC `suspend_event`/`unsuspend_event`.
- `/yonetim`: head admin ise sayfanın üstünde "Platform" bölümü: askı durumu, gerekçe alanı, "Askıya al" / "Askıyı kaldır" (ActionForm, yıkıcı onay deseni mevcut `HoldToLock` değil düz onay). Head admin'in tam ekranı Plan 3'te.

- [ ] **Step 1:** `tests/routes.mjs` (ya da mevcut rota test düzeni) içine: askıdaki etkinlikte ana sayfa HTML'inde uyarı metni var, ziyaretçi için "Gerekçe:" yok.
- [ ] **Step 2:** Çalıştır → FAIL.
- [ ] **Step 3:** Uygula; panel ve kayıt formlarında askıdayken gönderim düğmeleri pasif ve uyarı görünür.
- [ ] **Step 4:** `npm run check` ve `npm run test:routes` → PASS.
- [ ] **Step 5: Commit** — "Askı uyarısı ve head admin askı işlemleri"

---

### Task 9: Bootstrap betiği, canlı DB ve yayın

**Files:** Create `scripts/bootstrap-head-admin.mjs`

**Interfaces:** `node scripts/bootstrap-head-admin.mjs` — `.env.local`'dan `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_GITHUB_IDS` (ilk id) okur; `auth.admin.listUsers` sayfalarında `identities[].provider === "github"` ve `identity_data.provider_id === id` olan kullanıcıyı bulur; `rpc("bootstrap_head_admin", { p_user, p_login })`; sonucu yazdırır (`true` = atandı, `false` = zaten vardı).

- [ ] **Step 1:** Betiği yaz; kullanıcı bulunamazsa sıfır olmayan çıkış koduyla "GitHub kimliği bulunamadı".
- [ ] **Step 2: Canlı DB kontrolü (memory: önce main ve canlı DB)** — Supabase MCP `list_migrations` ile canlıda 0001–0011'in uygulandığını doğrula; `0011` yoksa dur ve kullanıcıya sor.
- [ ] **Step 3: Kullanıcı onayı al**, sonra `apply_migration` ile `0012_topluluklar` uygula (geriye uyumlu; eski kod çalışmaya devam eder). `execute_sql`: `select slug, status from communities; select count(*) from events where community_id is null;` → `deu-csai onaylandi`, `0`.
- [ ] **Step 4:** `node scripts/bootstrap-head-admin.mjs` → `true`. Doğrula: `select login, role from platform_roles;` → devfurkanakblt head_admin; `select role from community_members` → owner.
- [ ] **Step 5:** `get_advisors` (security) → yeni tablolar için RLS uyarısı olmamalı.
- [ ] **Step 6:** Commit, push, PR (`feat/coklu-topluluk` → `main`). PR açıklamasında: migration canlıda uygulandı; merge Vercel'de otomatik yayınlar; Plan 2'ye (adresler + ana sayfa) geçiş.

---

## Bu planın dışında kalanlar (sonraki planlar)

`is_current` kaldırma ve `/e/<slug>` adresleri, ana sayfa listesi, `community_id NOT NULL` (Plan 2) · başvuru formu, onay ekranı, organizatör/jüri davetleri ve sahiplik devri, LinkedIn, e-posta, head admin tam ekranı (Plan 3) · sözleşme onay kayıtları (Plan 4) · marka ayarları, maskotun etkinlik özelliğine dönüşmesi, halk oylaması/gizem/egg bayrakları, 30 gün arşiv silme (Plan 5).
