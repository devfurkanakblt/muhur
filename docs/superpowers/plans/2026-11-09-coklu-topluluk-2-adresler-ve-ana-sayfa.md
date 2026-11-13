# Çoklu topluluk · Plan 2: Etkinliğe göre adresler ve ana sayfa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Güncel etkinlik" (`events.is_current`) kavramını kaldırmak. Her etkinlik yüzeyi `/e/<slug>` altında yaşar, birden çok etkinlik aynı anda açık olabilir, `/` platform ana sayfası olur ve eski adresler kırılmaz.

**Architecture:** İki migration. `0013` yalnızca ekler ve gevşetir; eski kodla uyumludur, merge'den önce canlıya uygulanır. `0014` `is_current` ile `switch_event` ailesini kaldırır; merge ve Vercel yayınından sonra uygulanır. Uygulamada:
- Saf adres/seçim yardımcıları `lib/event-routes.ts` içinde, birim testleriyle.
- Sayfalar `app/e/[slug]/…` altına taşınır.
- Sunucu eylemleri etkinliği formdan ya da bağlı argümandan alır; yetki Plan 1'deki gibi etkinlik başına denetlenir.
- Eski adresler en uygun etkinliğe yönlendirir.

**Tech Stack:** Next.js 16 App Router. `params` bir Promise'tir; yazmadan önce `node_modules/next/dist/docs/` içindeki dynamic routes, redirect, notFound ve route handlers rehberlerini oku. `PageProps` tipleri için `npx next typegen`. Supabase Postgres; `node --test`, `npm run test:db`, `npm run test:routes`.

**Spec:** `docs/superpowers/specs/2026-11-09-coklu-topluluk-design.md`; uygulama sırasının 3. adımı, "Adresler" ile "Ana sayfa ve marka" bölümleri. Plan 1 (`…-1-veri-ve-yetki.md`) tamamlandı ve canlıda. Sonraki planlar:
- Plan 3: başvuru, davetler, LinkedIn ve e-posta. "Topluluğunu kaydet" düğmesi o planla gelir.
- Plan 4: sözleşmeler.
- Plan 5: marka, platform alt bilgisi ve 30 gün saklama.

## Tamamlanma kaydı · 13 Kasım 2026

**Geliştirme ve yerel doğrulama tamamlandı.** Task 1–5 önceki commitlerde mevcuttu; Task 6, `3f17ee1` commitinde tamamlandı. Henüz birleştirilmiş veya canlıya uygulanmış sayılmaz; yayın adımları belgenin sonunda ayrı tutulur.

- [x] Task 1–5: veri modeli, etkinliğe göre eylemler/adresler, ana sayfa, yönetim merkezi ve eski bağlantılar.
- [x] Task 6: bütün açık etkinlikler için işçi; `0014`; SQL, eşzamanlılık ve stres testi düzeneği güncellemeleri.
- [x] Ek düzeltme: maskotun beş sunucu eyleminde de topluluk kontrolü; formdaki gizli kimlik değiştirilerek diğer toplulukta yazma yapılamaz.
- [x] Ek kapsam: iki açık etkinliğin ayrı panelleri/davetleri; değiştirilmiş etkinlik kimliğiyle yönetim ve maskot formu gönderimleri; işçinin bir etkinlikteki hatadan sonra diğerine devam etmesi.

**Son doğrulamalar:** `npm run check` (91/91 birim testi, lint, TypeScript), üretim derlemesi, `test:db` (0014 dahil bütün migration ve gerçek eşzamanlılık testleri), `test:routes`, `test:browser` (13 masaüstü/mobil görünüm; yatay taşma yok), `test:event-isolation` geçti. Ana sayfanın 1366px ve 390px görüntüleri `test-artifacts/home-desktop.png` ve `home-mobile.png` içinde; görsel olarak incelendi. Beş ekip/10 saniyelik kısa stres testinde değişmez ihlali yok; bu küçük koşum kapasite ölçümü değildir.

Aşağıdaki tamamlandı işaretleri mevcut kaynak ve doğrulamalara dayanır. Uygulama öncesi kırmızı-test adımları geçmişe ait olduğundan tekrar oluşturulmadı; bunlar tamamlanma listesi dışında açıklama olarak bırakıldı.

## Global Constraints

- **Yayın sırası:** `0013` canlıya merge'den önce uygulanır ve eski kod onunla çalışmaya devam eder. `0014` merge sonrası Vercel yayını bittikten sonra uygulanır. Bu daldaki kod `is_current` sütununu ve `switch_event`/`admin_switch_event` fonksiyonlarını **hiç okumaz ve çağırmaz**.
- **Adresler:**
  - `/e/<slug>`: vitrin ve geri sayım.
  - `/e/<slug>/panel`
  - `/e/<slug>/sahne`
  - `/e/<slug>/yonetim`
  - `/e/<slug>/belge`
  - `/e/<slug>/maskot`
  - Bilinmeyen slug her yüzeyde 404 döner, 500 değil.
- **Eski adresler** 307 ile yönlendirir: `/panel`, `/sahne`, `/belge`, `/maskot`.
  - `/yonetim` artık yönetim merkezi sayfasıdır.
  - `/davet/<code>` ile `/sergi/<slug>/…` aynen çalışır.
- **Ana sayfada listelenen etkinlik:** topluluğu `onaylandi` ve kendisi askıda olmayan etkinliktir. Askıdaki etkinliğin `/e/<slug>` sayfası açılır ve askı uyarısını gösterir (Plan 1 davranışı).
- **Yetki:** her yönetim yazması Plan 1'deki RPC sarmalayıcılarından geçer. Formdan gelen etkinlik kimliğine güvenilmez; yetki her zaman o etkinlik için yeniden hesaplanır (`authorize` / `requireEventAction`). Yeni bir doğrudan tablo yazma yolu eklenmez.
- **Hata önekleri** Plan 1'deki gibidir: `YETKI:`, `ASKIDA:`, `YARISAMAZ:`. Yeni önek eklenmez.
- **Görsel:** DESIGN.md kuralları geçerli: 2px köşe, kart ve gölge yok, indigo yalnızca süre, kilit ve birincil eylem için. Arayüz dili Türkçe.
- **Ana sayfa metinleri:**
  - Başlık: "Süre dolar, mühür vurulur."
  - Alt satır: "Hackathon teslimlerini sunucuda mühürleyen platform."
  - Bölüm başlıkları: "Aktif etkinlikler", "Geçmiş etkinlikler · sergiler".
  - Boş durum: "Şu an aktif etkinlik yok."
  - Başlamamış etkinlik: "Yakında".
- Kodda Türkçe yorum ve isimlendirme düzeni korunur.

## Review Focus

1. **Aynı anda iki açık etkinlik:**
   - Katılımcı B'ye kaydolduğunda proje B'ye düşer ve A'nın panelinde görünmez.
   - Ekip kodu da B'nin projesine katar.
   - Testler: Task 1 (SQL) ve Task 3/5 (panel).
2. **Sahte etkinlik kimliği:**
   - Başka topluluğun etkinlik id'si gizli alana yazılırsa yönetim eylemi `YETKI:` ile reddedilir.
   - Katılımcı eylemi yalnızca o etkinliğin kurallarıyla çalışır.
   - Task 3 bu yolu `authorize(event, …)` üzerinden geçirir; hiçbir eylem `getEventById` sonucunu yetki denetimi olmadan kullanmaz.
3. **Eski bağlantılar:** `/panel`, `/sahne`, `/belge`, `/maskot`, `/davet/<code>`, `/sergi/<slug>/1` çalışır (Task 5 rota testi).
4. **Bilinmeyen slug:** `/e/yok`, `/e/yok/panel` ve `/api/durum?e=yok` 404 döner (Task 4 rota testi).
5. **Ana sayfada askıdaki ve reddedilmiş topluluğun etkinliği görünmez;** etkinlik yoksa boş durum metni çıkar (Task 2 birim testi, Task 5 rota testi).

---

## Dosya haritası

- **Migration'lar:**
  - Create `supabase/migrations/0013_etkinlik_olustur.sql`
  - Create `supabase/migrations/0014_guncel_etkinlik_kaldir.sql`
  - Modify `scripts/test-db.mjs`, `tests/database*.sql`, `scripts/stress-seal.mjs`, `audit/*`
- **Yardımcılar:** Create `lib/event-routes.ts`, test `tests/event-routes.test.mjs`; Modify `lib/data.ts`.
- **Sunucu eylemleri:** Modify `app/actions.ts`, `app/maskot/actions.ts`, form bileşenleri (`components/*.tsx`).
- **Etkinlik sayfaları:**
  - Create (taşıma): `app/e/[slug]/page.tsx`, `panel/page.tsx`, `sahne/page.tsx`, `yonetim/page.tsx`, `belge/page.tsx`, `maskot/page.tsx`
  - Modify `components/site-header.tsx`, `lib/status.ts`, `lib/stage.ts`, `lib/mascot-naming.ts`, `app/api/durum`, `app/api/sahne`, `app/api/maskot/durum`
- **Ana sayfa, merkez ve yönlendirmeler:**
  - Rewrite `app/page.tsx`, `app/yonetim/page.tsx`, `app/panel/page.tsx`, `app/sahne/page.tsx`, `app/belge/page.tsx`, `app/maskot/page.tsx`
  - Modify `app/davet/[code]/page.tsx`, `app/api/kazanan/[id]`, `app/api/belge`
- **İşçi:** Modify `lib/freeze.ts` (bütün açık etkinlikler).
- **Fixture ve testler:** Modify `tests/preview.mjs`, `tests/routes.mjs`, `tests/browser.mjs`.

---

### Task 1: `0013` — etkinlik oluşturma ve `is_current`'tan bağımsız katılım

**Files:**
- Create: `supabase/migrations/0013_etkinlik_olustur.sql`
- Create: `tests/database-events.sql`
- Modify: `scripts/test-db.mjs` (migration listesine `0013`, test listesine `tests/database-events.sql`)

**Interfaces — Produces (SQL):**
- `register_project_v0` ve `join_project_by_code_v0` aynı imza ve gövdeyle `create or replace` edilir. Tek fark: `perform id from events where id = … and is_current for share` satırındaki `and is_current` koşulu kalkar. Kaynak gövdeler 0004 (`register_project`) ile 0005 (`join_project_by_code`) dosyalarındadır; 0012 bunları yalnızca yeniden adlandırdı. 0012'deki `revoke … from public, anon, authenticated, service_role` izinleri `create or replace` ile korunur; testte doğrula.
- `public.admin_create_event(p_community uuid, p_title text, p_slug text, p_starts timestamptz, p_deadline timestamptz, p_actor uuid, p_login text) returns uuid`, `security definer`, `search_path = public`. Sırayla:
  1. `select status from communities where id = p_community for share`. Kayıt yoksa: `YETKI: Bu toplulukta etkinlik oluşturma yetkin yok.`
  2. Aktör `community_members` içinde bu toplulukta `owner` ya da `organizator` değilse aynı `YETKI:` mesajı. Head admin üye değilse o da reddedilir.
  3. `status = 'askida'` ise `ASKIDA: Bu topluluk platform tarafından geçici olarak durduruldu.`; `status <> 'onaylandi'` ise `YETKI:` mesajı.
  4. Ad 3..80 karakter, slug `^[a-z0-9-]{3,40}$`, `p_starts < p_deadline`, `p_deadline > clock_timestamp()`. İhlalde öneksiz Türkçe hata: "Etkinlik bilgileri geçersiz."
  5. `insert into events(title, slug, starts_at, deadline, community_id)`. `is_current` verilmez, varsayılanı false.
  6. `perform log_admin(p_actor, p_login, 'event_created', new_id, null, null, jsonb_build_object('title',…,'slug',…,'starts_at',…,'deadline',…,'community',p_community))`.
  7. Yeni id'yi döndürür.
- İzinler: `revoke all … from public, anon, authenticated`; `grant execute … to service_role`.

- [x] **Step 1:** `tests/database-events.sql` testlerini yaz. `pg_temp.assert_true` / `expect_error` yardımcılarını `tests/database-tenancy.sql` başlığından kopyala. Kimlikler: kullanıcı `7000…01–04`, topluluk B `slug='test-b'` onaylı. Testler:
  - DEÜ sahibi (`7000…01`) `admin_create_event` ile **iki** etkinlik oluşturur. İkisi de kilitsizdir ve aynı anda var olur.
  - `7000…03`, `is_current = false` olan ikinci etkinliğe `register_project` ile kaydolur. Proje o etkinliğin `event_id`'sini taşır.
  - `7000…04` o projenin davet koduyla `join_project_by_code` yapar ve başarılı olur.
  - B'nin organizatörü (`7000…02`) DEÜ'de etkinlik oluşturmak ister: `YETKI`.
  - Üye olmayan head admin: `YETKI`.
  - `test-b` `askida` yapılınca B organizatörü: `ASKIDA`. `beklemede` iken: `YETKI`.
  - Aynı slug ikinci kez: hata.
  - Geçmiş son teslim: hata.
  - Her başarılı oluşturmada `admin_audit` içinde `action = 'event_created'` satırı vardır.
  - `has_function_privilege('authenticated', 'public.admin_create_event(uuid,text,text,timestamptz,timestamptz,uuid,text)', 'execute')` false; `register_project_v0` için `service_role` da false.
- **Geçmişteki kırmızı-test adımı (bu tur tekrarlanmadı):** **Step 2:** `POSTGRES_BIN="C:/Users/User/pgsql17/pgsql/bin" npm run test:db` çalıştır. Beklenen: yeni dosyada FAIL (fonksiyon yok).
- [x] **Step 3:** `0013_etkinlik_olustur.sql` dosyasını yaz (`begin; … commit;`).
- [x] **Step 4:** `npm run test:db` çalıştır. Beklenen: bütün SQL dosyaları PASS, eskiler dahil.
- [x] **Step 5:** Commit: `0013: topluluk etkinliği oluşturma; katılım güncel etkinliğe bağlı değil`.

---

### Task 2: Saf adres yardımcıları ve veri katmanı

**Files:**
- Create: `lib/event-routes.ts` (saf modül; `server-only` import etmez)
- Create: `tests/event-routes.test.mjs`
- Modify: `lib/data.ts`

**Interfaces — Produces:**
- `lib/event-routes.ts`:
  - `type EventSurface = "panel" | "sahne" | "yonetim" | "belge" | "maskot"`
  - `eventPath(slug: string, surface?: EventSurface): string` → `/e/<slug>` ya da `/e/<slug>/<surface>`. Slug `encodeURIComponent`'ten geçer.
  - `type ListedEvent = { id: string; slug: string; startsAt: string; deadline: string; lockedAt: string | null; sealTime: string; suspended: boolean; communityStatus: string | null }`
  - `isListed(e: ListedEvent): boolean`: `communityStatus === "onaylandi" && !e.suspended`.
  - `splitHomeEvents<T extends ListedEvent>(events: T[], now: number): { active: T[]; past: T[] }`. Önce `isListed` süzgeci uygulanır.
    - `active`: `lockedAt == null && now < deadline`; son teslime göre artan sıralı.
    - `past`: geri kalanlar; `sealTime`'a göre azalan sıralı, en çok 12.
  - `pickLegacyEvent<T extends ListedEvent>(events: T[], now: number): T | null`. Listelenen etkinlikler arasında önce `active`'in ilki (en yakın son teslim), yoksa `past`'ın ilki (en yeni mühür), yoksa null.
- `lib/data.ts`:
  - `EVENT_SELECT` topluluktan `slug, city` alanlarını da okur. `EventState`'e `communitySlug: string | null` ve `communityCity: string | null` eklenir. `EventState`, `ListedEvent` ile yapısal olarak uyumludur.
  - `requireEventBySlug(slug: string): Promise<EventState>`: `getEventBySlug`; null ise `notFound()` (next/navigation). `cache` ile sarılır.
  - `getListedEvents(): Promise<EventState[]>`: bütün etkinlikler (`getEvents`) üzerinde `isListed` süzgeci.
  - `getViewerEvents(userId: string): Promise<EventState[]>`: kullanıcının `project_members` üyeliği olan etkinlikler. Okuma hatasında `readFailed`.
  - `getManagedCommunities(userId: string): Promise<{ id: string; slug: string; name: string; status: string; role: "owner" | "organizator" }[]>`
  - `getEvent()` ve `isCurrent` bu task'ta **kalır**; Task 5 kaldırır.

- [x] **Step 1:** `tests/event-routes.test.mjs` testlerini yaz (`node:test`; içe aktarma `tests/register.mjs` yükleyicisiyle `@/lib/event-routes`). Testler:
  - `eventPath("ekozeka")` → `"/e/ekozeka"`.
  - `eventPath("ekozeka","panel")` → `"/e/ekozeka/panel"`.
  - `splitHomeEvents` örneği; `now = Date.parse("2026-11-09T12:00:00Z")`:
    - Açık ve onaylı etkinlik `active`'e girer.
    - Askıdaki onaylı etkinlik hiçbir listede yoktur.
    - `communityStatus: "askida"` ve `"reddedildi"` hiçbir listede yoktur.
    - Son tarihi geçmiş ama `lockedAt` null olan `past`'a girer.
    - `active` en yakın son teslim önce gelecek şekilde sıralanır.
    - 14 geçmiş etkinlikten `past` 12'sini döndürür ve en yeni `sealTime` ilk gelir.
  - `pickLegacyEvent([])` → null.
  - Yalnızca geçmiş etkinlik varsa en yeni mühürlü olanı döndürür.
  - Açık ve geçmiş birlikteyse açık olanı döndürür.
  - Askıdaki etkinliği hiç seçmez.
- **Geçmişteki kırmızı-test adımı (bu tur tekrarlanmadı):** **Step 2:** `npm test` çalıştır. Beklenen: `event-routes` FAIL (modül yok).
- [x] **Step 3:** `lib/event-routes.ts` ve `lib/data.ts` eklemelerini yap.
- [x] **Step 4:** `npm run check` çalıştır. Beklenen: test, lint ve tsc PASS.
- [x] **Step 5:** Commit: `Etkinlik adres yardımcıları ve liste okumaları`.

---

### Task 3: Sunucu eylemleri etkinliği açıkça alır

**Files:**
- Modify: `app/actions.ts`, `app/maskot/actions.ts`
- Modify: bu eylemleri çağıran form bileşenleri. `grep -rn "from \"@/app/actions\"\|maskot/actions" components app` ile bul: `project-form`, `delivery-panel`, `team-actions`, `join-form`, `vote-button`, `mystery-egg`, `admin-forms`, `hold-to-lock`, `app/maskot/naming-experience.tsx` vb.
- Modify: bileşenleri render eden mevcut sayfalar (`app/page.tsx`, `app/panel/page.tsx`, `app/yonetim/page.tsx`, `app/maskot/page.tsx`, `app/davet/[code]/page.tsx`); `event.id`'yi aktarırlar.

**Interfaces:**
- Consumes: `getEventById` (`lib/data.ts`), `eventPath` (Task 2), Plan 1'den `authorize` / `requireManager` / `requireFreshManager` (`app/actions.ts` içinde).
- Produces:
  - `app/actions.ts` içinde özel yardımcı `loadEvent(raw: unknown): Promise<EventState | string>`. UUID değilse ya da kayıt yoksa `"Etkinlik bulunamadı."` döner.
  - Kural: **form verisi alan** her eylem etkinliği gizli `<input type="hidden" name="event" value={event.id}>` alanından okur. **Form verisi almayan** eylemler (`leaveProject`, `renewInvite`, `lockNowAction`, `recheckHealth`, `submitVersion`, `runWorker`) ilk parametre olarak `eventId: string` alır ve çağıran yerde `.bind(null, event.id)` ile bağlanır.
  - `revalidatePath(eventPath(event.slug), "layout")`. Eskiden `revalidatePath("/", "layout")` olan yerlere ek olarak ana sayfa için `revalidatePath("/")`.
  - `createEvent(_: FormState, formData)`:
    - Alanlar: `community` (uuid), `title`, `slug`, `starts`, `deadline`.
    - `rpc("admin_create_event", …)` çağırır. Mevcut ad/slug/tarih doğrulamaları ve `trDate` korunur.
    - "Güncel etkinlik mühürlendikten sonra" kuralı kalkar.
    - Taze oturum korunur: topluluğun herhangi bir etkinliği yokken de çalışmalı, bu yüzden `requireFreshManager(event)` yerine taze oturum (`getAdminSession` / `isFreshSignIn`) doğrudan denetlenir. Yetkiyi RPC verir.
    - Başarıda `{ ok: true }` ve `revalidatePath("/yonetim")`.
    - Eş istek yarışı için `is_current` okuması **silinir**. Aynı slug ve aynı başlıklı etkinlik zaten aynı toplulukta varsa ok döner.
  - `anonymizeUser` etkinlik okumaz: görüntüleyen `isHeadAdmin` değilse `"Yetkisiz"`. Taze oturum kuralı korunur; RPC zaten head admin denetler.
  - `app/maskot/actions.ts` içindeki beş eylem de `event` gizli alanını okur.
- Bu task'tan sonra `app/actions.ts` ve `app/maskot/actions.ts` içinde `getEvent(` geçmez.

- [x] **Step 1:** Eylemleri değiştir. Her eylemde `loadEvent` sonucu string ise `{ error }` döndür. Ardından var olan yetki ya da katılımcı akışı **aynı `event` nesnesiyle** sürer.
- [x] **Step 2:** Bileşenlere gizli alanı ya da `bind`'ı ekle; sayfalar `event.id`'yi geçirsin. Mevcut "yeni etkinlik" formu bu task'ta gizli `community = event.communityId` alanını taşır. Topluluk seçimli form Task 5'te merkeze taşınır.
- [x] **Step 3:** `npm run check` ve `npm run build` çalıştır. Beklenen: PASS.
- [x] **Step 4:** Önizlemeyi ve rota testlerini çalıştır: `npm run preview:test` arka planda (fixture :54330, uygulama :3100 — betiğin kendi talimatına bak), ardından `npm run test:routes`. Beklenen: mevcut bütün durumlar PASS; adresler henüz değişmedi.
- [x] **Step 5:** Commit: `Sunucu eylemleri etkinliği formdan alır; yetki etkinlik başına`.

---

### Task 4: Etkinlik yüzeyleri `/e/<slug>` altında

**Files:**
- `git mv` ile taşı, sonra düzenle:
  - `app/page.tsx` → `app/e/[slug]/page.tsx`
  - `app/panel/page.tsx` → `app/e/[slug]/panel/page.tsx`
  - `app/sahne/*` → `app/e/[slug]/sahne/*`
  - `app/belge/*` → `app/e/[slug]/belge/*`
  - `app/maskot/*` → `app/e/[slug]/maskot/*` (`actions.ts`, css ve bileşenler dahil)
- Create: `app/e/[slug]/yonetim/page.tsx`. Mevcut `app/yonetim/page.tsx` içinden **etkinliğe ait** bölümler (zamanlar, duyuru, etkinlik anı, kilit, oylama, ödüller, teslim işleri, jüri paketi, askı düğmeleri) buraya taşınır. Platform bölümleri Task 5'te `/yonetim`'de kalır: anonimleştirme, işçi kayıtları, etkinlik oluşturma.
- Modify: `components/site-header.tsx`, `lib/status.ts`, `lib/stage.ts`, `lib/mascot-naming.ts`, `app/api/durum/route.ts`, `app/api/sahne/route.ts`, `app/api/maskot/durum/route.ts`, `components/live-state.tsx`, sahne ve maskot istemci bileşenleri (yoklama adresleri).
- Modify: `tests/preview.mjs` (fixture `events?slug=eq.…` sorgusunu ve yeni select alanlarını yanıtlar), `tests/routes.mjs` (durum adresleri `/e/ornek-etkinlik/…`).

**Interfaces:**
- Consumes: `requireEventBySlug`, `eventPath` (Task 2); Task 3'ün eylem sözleşmesi.
- Produces:
  - `SiteHeader({ viewer, event }: { viewer: Viewer | null; event?: EventState })`. `event` varsa:
    - Logo yanında `event.communityName` gösterilir. Sabit "DEÜ CS&AI" yazısı kalkar.
    - Gezinme: Vitrin `eventPath(slug)+"#vitrin"`, Katılım belgesi, Projem `eventPath(slug,"panel")`. Yönetim `eventPath(slug,"yonetim")` yalnızca `can(…,"incele")` ise görünür.
    - "Maskota isim ver" yalnızca `event.communitySlug === "deu-csai"` ise görünür.
    - Duyuru şeridi o etkinliğin duyurusudur.
  - `event` yoksa (platform sayfaları) yalnızca wordmark, "Sergiler" (`/sergiler`), giriş yapmışsa "Yönetim" (`/yonetim`) ve tema düğmesi görünür.
  - `getLiveStatus(event: EventState)`, `getStageData(event: EventState)`, `getMascotNamingSnapshot(event: EventState)`: parametreli; içlerinde `getEvent()` yoktur.
  - API'ler `?e=<slug>` alır. Eksik ya da bilinmeyen slug `404` döner; JSON gövdesi `{ error: "Etkinlik bulunamadı." }`. İstemci yoklayıcılar slug'ı prop olarak alır.
  - Her `app/e/[slug]/**/page.tsx`:
    - `const { slug } = await params; const event = await requireEventBySlug(slug);`
    - `generateMetadata` başlığı: `${event.title} · mühür`.
    - Sayfa içi bağlantılar `eventPath` ile kurulur. Sergi bağlantıları zaten slug'lı (`exhibitPath`) ve değişmez.
  - Etkinlik vitrini (`/e/<slug>`) hero'nun üstünde küçük bir satırda `communityName` ve `event.title` gösterir; markalamanın geri kalanı Plan 5'tedir.
  - `/e/<slug>/yonetim`: incele yetkisi yoksa `notFound()` (bugünkü `/yonetim` davranışı).
  - `/e/<slug>/maskot`: topluluk `deu-csai` değilse `notFound()`.

- [x] **Step 1:** `tests/routes.mjs` içindeki `/`, `/panel`, `/yonetim`, `/sahne` durumlarını `/e/ornek-etkinlik`, `/e/ornek-etkinlik/panel`, `/e/ornek-etkinlik/yonetim`, `/e/ornek-etkinlik/sahne` yap; askı ve rol testlerini de aynı biçimde güncelle. Şu yeni durumları ekle:
  - `/e/yok` → 404
  - `/e/yok/panel` → 404
  - `/api/durum?e=yok` → 404
  - `/api/durum?e=ornek-etkinlik` → 200 ve `version` alanı var
  - `/e/ornek-etkinlik` HTML'i fixture topluluk adını içerir
- **Geçmişteki kırmızı-test adımı (bu tur tekrarlanmadı):** **Step 2:** `npm run test:routes` çalıştır. Beklenen: yeni adresler FAIL.
- [x] **Step 3:** Sayfaları taşı ve parametrelendir; header, durum ve yoklama uç noktalarını güncelle; fixture'ı genişlet.
- [x] **Step 4:** `npm run check`, `npm run build`, `npm run test:routes` ve `npm run test:browser` çalıştır. Browser testindeki adresler de `/e/…` olur. Beklenen: PASS.
- [x] **Step 5:** Commit: `Etkinlik yüzeyleri /e/<slug> altında`.

---

### Task 5: Platform ana sayfası, yönetim merkezi ve eski adresler

**Files:**
- Create: `app/page.tsx` (platform ana sayfası), `app/yonetim/page.tsx` (merkez).
- Create: yönlendirme sayfaları `app/panel/page.tsx`, `app/sahne/page.tsx`, `app/belge/page.tsx`, `app/maskot/page.tsx`.
- Create: `components/event-list.tsx`. Satırda logo yer tutucusu (topluluk adının baş harfleri, 42px kare, 2px köşe), etkinlik adı, `topluluk · şehir` ve sağda geri sayım ya da "Yakında" bulunur. Geri sayım için mevcut `components/clock.tsx` ya da hero sayacı yeniden kullanılabilir.
- Modify: `app/davet/[code]/page.tsx`, `app/api/kazanan/[id]/route.tsx`, `app/api/belge/route.tsx`, `lib/certificate-access.ts` (gerekirse), `components/buttons.tsx` (`SignInButton` `next` varsayılanı).
- Modify: `lib/data.ts`: `getEvent` ve `isCurrent` silinir; `EventRow.is_current` de çıkar.
- Modify: `tests/preview.mjs`, `tests/routes.mjs`.

**Interfaces:**
- Consumes: `splitHomeEvents`, `pickLegacyEvent`, `eventPath` (Task 2); `getListedEvents`, `getViewerEvents`, `getManagedCommunities`; Task 3'ün `createEvent` sözleşmesi; Task 4'ün `SiteHeader` (etkinliksiz hali).
- Davranışlar:
  - **`/`:**
    - Başlık ve alt satır Global Constraints'teki metinlerdir.
    - "Aktif etkinlikler" listesi `splitHomeEvents(...).active`; her satır `eventPath(slug)`'a gider.
    - Boşsa "Şu an aktif etkinlik yok." yazar.
    - "Geçmiş etkinlikler · sergiler" listesi `past`; satır `/sergi/<slug>`'a gider.
    - Kilit yazma tetikleyicisi (`ensureLocked` / `after`) bu sayfadan kalkar. Kilidi işçi ve etkinlik sayfası (`/e/<slug>`, Task 4'te taşındı) yazar.
  - **`/yonetim` (merkez):** giriş yoksa ve hiçbir rol yoksa `notFound()`. Görünenler:
    - (a) Yönetilebilir ya da incelenebilir etkinlikler. Head admin için hepsi; diğerleri için `getManagedCommunities` topluluklarının etkinlikleri. Her biri `eventPath(slug,"yonetim")`'e gider ve durum gösterir (açık / mühürlü / askıda).
    - (b) Onaylı topluluklarında "Yeni etkinlik" formu: topluluk seçimi, ad, slug, başlangıç, son teslim → `createEvent`.
    - (c) Yalnızca head admin için: anonimleştirme formu ve işçi kayıtları (Plan 1'de `/yonetim`'de olan bölümler).
  - **Eski adres yönlendirmeleri (307, `redirect` from next/navigation):**
    - `/panel` → görüntüleyen girişliyse `pickLegacyEvent(getViewerEvents(id))`, yoksa `pickLegacyEvent(getListedEvents())`; bulunursa `eventPath(slug,"panel")`. Hiç etkinlik yoksa `/`.
    - `/sahne` ve `/belge` → `pickLegacyEvent(getListedEvents())` için ilgili yüzey.
    - `/maskot` → yalnızca `communitySlug === "deu-csai"` olan listelenen etkinlikler arasından seçer.
    - Sorgu dizesi (`?hata=…` vb.) korunur.
  - **`/davet/<code>`:** etkinlik davet kodunun projesinden okunur (`projects.invite_code` → `event_id` → `getEventById`). Kod geçersizse sayfanın bugünkü "geçersiz davet" görünümü kalır. `getEvent()` kullanılmaz.
  - **`/api/kazanan/[id]` ve `/api/belge`:** etkinlik kaydın kendisinden (ödül ya da proje) okunur. `/api/belge` ayrıca `?e=<slug>` alabilir.
  - `SignInButton` varsayılan `next` değeri `/panel`dir; yönlendirme bunu karşılar.
  - Bu task'tan sonra `grep -rn "getEvent()\|is_current\|isCurrent" app lib components` boş döner.

- [x] **Step 1:** `tests/routes.mjs`'e ekle:
  - `/` fixture etkinliğinin adını ve "Süre dolar, mühür vurulur." metnini içerir. Fixture'da etkinlik askıdayken (`?askida=1`) ad listede yoktur.
  - `fetch("/panel", { redirect: "manual" })` 307 döner ve `location` `/e/ornek-etkinlik/panel` olur; `/sahne` ve `/belge` için de aynısı.
  - `/yonetim` anonimde 404, yabancı rolde 404, yönetici rolde 200. Sayfa `/e/ornek-etkinlik/yonetim` bağlantısını ve "Yeni etkinlik" formunu içerir.
  - `/davet/<fixture kodu>` 200 döner.
  - `/sergi/ornek-etkinlik/1` 200 döner.
- **Geçmişteki kırmızı-test adımı (bu tur tekrarlanmadı):** **Step 2:** `npm run test:routes` çalıştır. Beklenen: yeni durumlar FAIL.
- [x] **Step 3:** Sayfaları, yönlendirmeleri ve listeyi yaz; kalan `getEvent` çağrılarını kaldır; fixture'ı genişlet (topluluk listesi, `community_members` sorgusu, davet kodu sorgusu).
- [x] **Step 4:** `npm run check`, `npm run build`, `npm run test:routes` ve `npm run test:browser` çalıştır. Beklenen: PASS. Ana sayfanın ekran görüntüsü masaüstü ve 390px genişlikte `test-artifacts/` altına alınır; yatay kaydırma olmamalı.
- [x] **Step 5:** Commit: `Platform ana sayfası, yönetim merkezi ve eski adres yönlendirmeleri`.

---

### Task 6: Bütün açık etkinlikler için işçi ve `0014`

**Files:**
- Modify: `lib/freeze.ts`
- Create: `supabase/migrations/0014_guncel_etkinlik_kaldir.sql`
- Modify: `scripts/test-db.mjs`, `tests/database.sql`, `tests/database-*.sql`, `scripts/stress-seal.mjs`, `audit/database.sql`, `audit/reproduce-db.mjs`

**Interfaces:**
- **`tick()`:**
  - `events` sorgusunda `is_current` okunmaz.
  - Yardımcı kira (`tryLease("yardimci", 50)`) alınınca kilitsiz ve son teslimi gelmemiş **her** etkinlik için sırayla sağlık, ara mühür ve hatırlatma çalışır. Her adımdan önce `withinBudget()` denetlenir.
  - Sonuç `details` içinde etkinlik slug'ına göre gruplanır (`details.open = { [slug]: { health, snapshots } }`).
  - Bir etkinliğin hatası diğerlerini durdurmaz; `step` adı slug içerir.
- **`0014_guncel_etkinlik_kaldir.sql`**:
  - `drop function public.admin_switch_event(...)`, `public.admin_switch_event_v0(...)`, `public.switch_event(...)`.
  - `drop index public.events_one_current`; `alter table public.events drop column is_current`.
  - `alter table public.events alter column community_id set not null`. Önce `do $$ … if exists(select 1 from events where community_id is null) then raise exception …` denetimi yapılır.
- **Testler:** bütün `tests/*.sql` ve betiklerdeki `update events set is_current…` satırları kaldırılır; etkinlik eklemeleri `community_id` verir (`(select id from communities where slug='deu-csai')`). `tests/database.sql` ve `tests/database-tenancy.sql` içindeki `switch_event` / `admin_switch_event` testleri `admin_create_event` testine dönüşür ya da silinir; kapsam Task 1'de. 0014 sonrası için yeni test: `select count(*) from information_schema.columns where table_name='events' and column_name='is_current'` 0 döner.

- [x] **Step 1:** `0014`'ü ve test güncellemelerini yaz; `scripts/test-db.mjs` listesine `0014`'ü ekle.
- [x] **Step 2:** `POSTGRES_BIN="C:/Users/User/pgsql17/pgsql/bin" npm run test:db` çalıştır. Beklenen: PASS.
- [x] **Step 3:** `tick()`'i değiştir.
- [x] **Step 4:** `npm run check`, `npm run build` ve `npm run test:routes` çalıştır. Beklenen: PASS. Ayrıca `grep -rn "is_current\|switch_event" app lib components scripts tests audit` yalnızca `0002–0014` migration dosyalarında eşleşir.
- [x] **Step 5:** Commit: `İşçi bütün açık etkinlikleri işler; 0014 güncel etkinlik kavramını kaldırır`.

---

### Yayın (bekliyor; kontrolör, kullanıcı onayıyla)

1. Canlı DB durumunu kontrol et (`list_migrations`). Kullanıcı onayıyla `0013`'ü uygula. Eski kod çalışmaya devam eder.
2. Dalı push'la ve PR aç; kullanıcı merge eder ve Vercel yayınlar.
3. Yayın doğrulandıktan sonra, kullanıcı onayıyla `0014`'ü uygula. Ardından `get_advisors` ile güvenlik denetimini çalıştır.

Bu oturumda canlı migration, merge veya Vercel yayını yapılmadı. `0013` eski uygulamayla uyumlu olarak yayından önce, `0014` ise yeni uygulamanın yayını doğrulandıktan sonra uygulanmalıdır.
