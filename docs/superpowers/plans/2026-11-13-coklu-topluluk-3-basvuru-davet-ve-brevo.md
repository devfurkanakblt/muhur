# Çoklu topluluk · Plan 3: Başvuru, davetler, LinkedIn ve Brevo

Tarih: 13 Kasım 2026 · Durum: kod uygulandı ve yerelde doğrulandı; canlı servis/yayın provası bekliyor.

**Amaç:** GitHub hesabıyla topluluk başvurusu, head admin incelemesi, topluluk panosu, organizatör/jüri davetleri ve Brevo üzerinden işlemsel e-posta. Jüri LinkedIn ile de giriş yapabilir. Jüri puanlama sistemi kapsam dışıdır.

**Dayanak:** `../specs/2026-11-09-coklu-topluluk-design.md`, tamamlanan Plan 1–2. Başlangıç tabanı `feat/coklu-topluluk-2` üzerindeki `3f17ee1` ve `2ccd431`; Plan 2 henüz uzak depoya gönderilmiş/birleştirilmiş sayılmaz. Uygulamadan önce gerçek `main`, migration geçmişi ve dal durumu tekrar kontrol edilir.

**Kullanıcı kararı:** e-posta sağlayıcısı **Brevo**. Diğer teknik ayrıntılar bu belgenin uygulama önerileridir; önceki tasarımdaki roller ve yetki sınırları korunur.

## Bağımlılıklar ve sınırlar

- Plan 2'nin uygulama ve `0014` geçişi tamamlanmadan bu plan canlıya alınmaz. Migration numaraları aşağıda öneridir; uygulama anında boş oldukları doğrulanır.
- Plan 3, başvuru onayının kanıtını tutmak için ortak sözleşme tablolarının küçük temelini kurar. Plan 4 aynı tabloları kullanır; ikinci bir onay kayıt sistemi oluşturmaz.
- Yeni toplulukların genel kullanıma açılması Plan 4'ün zorunlu onay denetimleri ve Plan 5'in saklama/marka kuralları tamamlanana kadar kapalıdır. Mevcut DEÜ etkinlikleri çalışır. `COMMUNITY_APPLICATIONS_ENABLED` sunucuda kontrol edilir; yalnızca buton gizlemek yeterli değildir.
- Sözleşme taslakları yerelde denenebilir; gerçek başvuruda yalnızca yayınlanmaya hazır belge sürümleri kullanılır. Bu plan sözleşme metni yazmaz.
- `user_metadata`, kullanıcı adı ve e-posta eşitliği yetki kaynağı değildir. Roller UUID + topluluk/etkinlik kapsamından gelir.
- Bütün yeni tablolar RLS açık ve istemci rollerine kapalıdır. Yazmalar `security definer`, `search_path=public` RPC'lerinden; yürütme izni yalnızca gereken sunucu girişlerine verilir. İç yardımcılar ve `_v0` gövdeleri servis rolüne de kapalıdır.
- Next.js kodundan önce yerel `node_modules/next/dist/docs/` içindeki dynamic routes, cookies, redirect, server actions ve route handlers rehberleri okunur. Mevcut form kilidi ve taslak koruma deseni korunur.

## Ürün akışları

| Yüzey | Davranış |
|---|---|
| `/topluluk/basvur` | GitHub girişi; topluluk adı, adres kısaltması, kurum, şehir, sosyal/web bağlantısı; sorumlu adı, e-posta, telefon; belge onayları |
| `/topluluk/basvurularim` | Yalnızca kendi başvuruları, durum, gönderim zamanı, salt okunur bilgiler; ret gerekçesi ve yeniden başvuru |
| `/topluluk/<slug>` | Sahip/organizatör panosu: etkinlikler, üye listesi, yetkisine göre davet/çıkarma ve sahiplik devri |
| `/yonetim/topluluklar` | Yalnızca head admin: bekleyen başvurular, topluluk listesi, gerekçeli ret/askı ve sahip hesabı kurtarma |
| `/katil/<token>` | Organizatör ya da jüri daveti; giriş, kapsamın açık gösterilmesi ve ayrı kabul POST'u |
| `/e/<slug>/juri` | Jüriye yalnızca kendi etkinliğinin mühürlü teslimleri, CSV/ZIP ve tekil arşivler; puanlama yok |

Onaylanan topluluğun sahibi başvuran GitHub kullanıcısıdır. Ret sonrası önceki kayıt değiştirilmez: yeni topluluk başvurusu yeni kimlikle, önceki başvuruya referansla açılır. Eski slug tutulur; yeni başvuruda yeni slug veya head admin tarafından açıkça yönetilen slug kararı gerekir. Aynı kullanıcıda tek bekleyen başvuru sınırı önerilir; sahip olunan onaylı topluluklar ayrıca kalabilir.

Organizatör daveti yalnızca sahip; jüri daveti sahip/organizatör tarafından oluşturulur. Organizatörler birbirini davet edemez. Sahip kendisini çıkaramaz. Sahiplik normalde mevcut bir organizatöre devredilir; kurtarma işlemini head admin gerekçeyle yapar. Davet bağlantısı tek kullanımlık, 7 gün geçerli, iptal edilebilir bir erişim anahtarıdır; e-posta yalnızca teslim kanalıdır, adres eşitliği rol vermez. Bu süre ve taşıyıcı-bağlantı yaklaşımı teknik öneridir. GET/bağlantı tarayıcısı daveti tüketmez.

## Veri ve RPC sözleşmesi

### `0015_basvuru_ve_sozlesme_temeli.sql`

Mevcut `communities` başvuru alanları kullanılır; paralel başvuru tablosu oluşturulmaz. Ekler: `previous_application_id`, `application_request_id`; bekleyen başvuru başına kullanıcı tekilliği. Başvuru iletişim alanları genel etkinlik sorgularına eklenmez. Onaylı topluluğun iletişim bilgisi herkese açık değildir.

Ortak temel:
- `policy_documents(id, kind, version, content, content_sha256, status, published_at, created_at)`; `kind`: `platform`, `data_processing`, `participant`; `status`: `draft|published|retired`; tür/sürüm tekil. Yayınlanan içerik ve hash değişmez.
- `policy_subjects(id,user_id UNIQUE NULL)`: kullanıcıya ait değişmez özne anahtarı; hesap anonimleştirmesinde yalnız bu eşleme kontrollü ayrılabilir. `policy_acceptances(id,subject_id,document_id,scope_kind,scope_id,accepted_at)`; scope `community|event`; `scope_id` ilgili topluluk/etkinliktir. Tekillik `(subject_id,document_id,scope_kind,scope_id)`. Kimlik ve zaman sunucudan; belge hash'i değişmez belge kaydından bulunur. Özne UUID'si anonimleştirilmiş kaydı değişmez tutar; tek başına tam anonimlik/hukuki uygunluk iddiası taşımaz.
- Tür başına güncel sürümü seçmek için `policy_requirements(kind PRIMARY KEY, document_id FK)`; başvuru işlemi bu satırları kilitleyerek kendisine gösterilen sürümün hâlâ geçerli olduğunu doğrular. Plan 4 yayın/yeniden onay mantığını buraya bağlar.
- `mail_outbox` temel tablosu da bu migration'da kurulur (kolon sözleşmesi Task 4); başvuru/karar RPC'leri ilk günden kuyruk kaydını aynı transaction'da üretir. `0016` davet ilişkileri ve `mail_events` ekler; Task 4 taşıma işçisini uygular.
- Belge tabloları istemciye doğrudan açık değildir; yayınlanan belgeler kontrollü sunucu okumasıyla gösterilir. Onay satırları eklenir, içerikleri düzenlenmez; hesap anonimleştirme politikası Plan 4'te tamamlanır.
- `submit_community_application(p_actor uuid,p_login text,p_request uuid,p_fields jsonb,p_document_ids uuid[]) returns uuid`: alan ve kota doğrulaması; güncel iki topluluk belgesinin ayrı onayı; aynı transaction'da bekleyen topluluk + onay kayıtları + audit. Aynı aktör/istek tekrarında aynı kimlik; farklı içerikle aynı anahtar reddedilir. İstemci hash/zaman veremez.
- `review_community_application(p_community uuid,p_actor uuid,p_login text,p_decision text,p_reason text) returns void`: head admin; yalnızca `beklemede` satırından tek geçiş. Ret gerekçesi 3–500 karakter. Onayda sahip üyeliği, audit ve e-posta işi aynı transaction'da oluşur. E-posta API'si transaction içinde çağrılmaz.
- Alan sınırları sunucu ve SQL'de eşleşir: ad 2–80, slug mevcut 3–40 kuralı, kurum/şehir makul uzunluk, ad 2–120, e-posta en fazla 254, telefon en fazla 32; web bağlantıları yalnızca HTTPS, kimlik bilgisi içeren URL reddedilir. Telefon uluslararası girişe açık tutulur; yalnızca Türkiye numarası zorlanmaz.

### `0016_davetler_ve_brevo_kuyrugu.sql`

- `role_invites(id,kind,community_id,event_id,token_hash,recipient_email,created_by,created_at,expires_at,revoked_at,accepted_at,accepted_by)`. Kind `organizator|juri`; yalnızca uygun scope doludur, FK'ler ve CHECK'ler zorunludur. Token 32 rastgele bayt/base64url; DB'de SHA-256 hash'i, audit'te yalnızca davet kimliği.
- `create_role_invite(p_actor,p_login,p_kind,p_scope,p_token_hash,p_email,p_mail_ciphertext,p_request) returns uuid`: topluluk rolü/askı/güncel onay ve kota kontrolü; davet ile e-posta işi atomik. Aynı scope/adrese bekleyen daveti yenilemek eski tokenı iptal edip yeni kayıt üretir.
- `accept_role_invite(p_actor,p_login,p_provider,p_token_hash) returns jsonb`: kullanıcı + davet + scope kilitleri; süresi/iptali/tüketimi, güncel davet eden yetkisi ve yarışma çakışması tekrar kontrol edilir. `p_provider` tarayıcıdan alınmaz; doğrulanmış identity'den normalize edilir. Organizatör yalnızca GitHub; jüri GitHub veya LinkedIn. Aynı kişinin tekrar kabulü idempotent; başka kullanıcı reddedilir.
- `revoke_role_invite`, `remove_community_organizer`, `remove_event_juror`, `transfer_community_ownership`: aktörlü ve kapsamlı RPC'ler. Sahiplik kurtarmada mevcut `set_community_owner` güçlendirilir; eşdeğer ikinci kurtarma RPC'si yazılmaz. Kullanıcı adıyla hedef üyelik bulunmaz: UUID seçilir, sunucu doğrulanmış kimliği okur.
- Atama/çıkarma ve davet kabulü audit'e yazılır. İptal, atayan kişinin yetkisini kaybetmesi, askı ve süre dolması kabulü engeller.
- Yetki tablolarında servis rolüne doğrudan INSERT/UPDATE/DELETE yolları daraltılır; yeni akış RPC dışından rol atayamaz. Mevcut bootstrap ve head admin kurtarma yolu çalışmaya devam eder.

### Yarış ve kilit sırası

Davet tüketme tekilliği tek başına yeterli değildir: katılımcı kaydıyla jüri/organizatör ataması da yarışabilir. İlgili bütün yollar aynı kullanıcı için transaction advisory lock alır. Çok hedefli işlemde kullanıcı kilitleri sıralı; ardından topluluk, etkinlikler sıralı, proje/üyelik ve davet satırı. Başvuru/onay gibi ayrı yol da bu sıraya uyar. `register_project` ve `join_project_by_code` girişleri bu kullanıcı kilidini **etkinlik kilidinden önce** alacak şekilde güncellenir. Mevcut kilit sırası araştırılmadan tek tarafa advisory lock eklenmez.

Jüri ataması aynı etkinlikte mevcut proje üyeliğini reddeder (mühürden sonra da). Organizatör ataması topluluğun açık etkinliklerindeki proje üyeliğini reddeder; eski kilitli etkinlikte yarışmış olması engel değildir. Sahiplik devri/kurtarma aynı denetimi geçer. Atama kabulü ve eşzamanlı proje kaydı sonunda iki çelişkili rol oluşamaz.

## Task 1 — GitHub ve LinkedIn kimliklerini ayır

**Değiştir:** `lib/identity.ts`, `lib/data.ts`, `lib/access.ts`, `app/actions.ts`, `app/auth/callback/route.ts`, `components/buttons.tsx`; GitHub kimliği varsayan bütün tüketiciler. **Ekle:** `tests/linkedin-identity.test.mjs`.

- [x] `Viewer` GitHub kimliği olmayan doğrulanmış LinkedIn hesabını temsil eder; `githubId` nullable/discriminated olur. Derleyicinin gösterdiği her kullanım incelenir; boş stringle GitHub kimliği taklit edilmez.
- [x] Saf identity normalizer yalnızca Auth'un doğrulanmış `identities` kaydından provider/sub/display name okur. Rol ad/email'den türetilmez. Supabase provider `linkedin_oidc`, mevcut `event_jurors.provider='linkedin'` alanına açık normalizasyonla eşlenir.
- [x] GitHub gerektiren bütün katılımcı yolları (kayıt, ekibe katılma, teslim, halk oyu, gizem ve maskot yazmaları) açık GitHub identity denetimi yapar. LinkedIn-only hesap jüri olabilse de bunları kullanamaz.
- [x] OAuth girişinde yalnızca izin verilen providerlar; LinkedIn seçeneği jüri davetinde. Callback açık yönlendirmeye izin vermez; LinkedIn tokenı `gh_token` içine yazılmaz. GitHub tokenı depolanmadan mevcut token-kullanıcı kimlik eşleşmesi doğrulanır; eski/başka sağlayıcı tokenı temizlenir. Callback query'si token sağlayıcısının kanıtı sayılmaz.
- [x] Aynı Auth UUID'ye bağlı birden çok identity varsa yetki tek UUID'de kalır. Uygulama aynı e-postalı hesapları elle birleştirmez. Yerel identity testleri mevcut UUID'nin korunduğunu doğrular.
- [ ] Supabase otomatik identity linking davranışını gerçek, kontrollü iki sağlayıcı hesabıyla doğrula (hesap ayarı/yayın provası).
- [x] Test: sahte metadata, yalnız LinkedIn, yalnız GitHub, bağlı iki identity, değişmiş isim, bilinmeyen provider, başka kullanıcının GitHub tokenı, eski yönetici oturumu. `npm run check` ve üretim derlemesi.
- [x] Commit: `GitHub katılımcısı ve LinkedIn jürisi için doğrulanmış kimlik ayrımı`.

## Task 2 — Başvuru ve ortak onay temelini kur

**Ekle:** `0015`, `lib/community.ts`, `tests/database-community-applications.sql`, `tests/community.test.mjs`. **Değiştir:** `scripts/test-db.mjs`, `scripts/stress-seal.mjs` migration listesi.

- [x] Önce SQL testleri: çift başvuru, aynı request tekrar/çelişkisi, yanlış belge sürümü, eksik checkbox, yabancı aktör, aynı başvuruya eşzamanlı onay/ret, ret sonrası yeni başvuru.
- [x] Yukarıdaki şema ve RPC'ler; RLS, grant ve audit testleri. Head admin onayı taze oturumla sunucu eyleminden çağrılır. Güvenilir aktör UUID'sini oturum belirler.
- [x] `communities` üzerinde onay/owner/audit/e-posta işini aynı transaction'da kur. Outbox temel tablosu bu adımda vardır; Brevo servisi olmadan SQL test edilebilir. Sağlayıcı işçisi gelene kadar mesajlar pending kalır; ara adım gerçek kullanıma açılmaz.
- [x] Mevcut DEÜ seed'i ve sahibi yeniden oluşturulmaz; eski mühür/ödül kayıtlarına yazılmaz. Testler gerçek 0001–0015 zincirini çalıştırır.
- [x] Commit: `Topluluk başvurusu ve değişmez belge onay temeli`.

## Task 3 — Davet, üyelik ve sahiplik işlemleri

**Ekle:** `0016`, `lib/role-invites.ts`, `tests/database-role-invites.sql`. **Değiştir:** `0012` fonksiyonlarının yeni migration'daki gövdeleri; eski migration dosyalarını geriye dönük düzenleme.

- [x] Önce bütün scope/rol/süre/tekrar testleri ve gerçek iki bağlantılı kabul/iptal, kabul/kayıt, sahip devri/çıkarma yarışları.
- [x] RPC'ler, ortak kullanıcı kilidi ve servis rolü grant daraltması. Token üretimi sunucuda; kabulden önce kimlik sağlayıcısı doğrulanır.
- [x] Davet sayfası no-store ve `no-referrer`; tokenlı yüzey arama motoruna kapalı. Analitik/harici görsel tokenı taşımaz; token loglanmaz. Ham bağlantı yalnızca oluşturulduğu anda gösterilir; sonraki erişim için yenile/iptal akışı kullanılır.
- [x] Kota önerisi: kullanıcı başına 24 saatte 3 başvuru; topluluk/etkinlik başına saatte 20 davet; yeniden gönderme aynı davet için 5 dakika bekler. Kota atomik DB kontrolüdür, mevcut `worker_leases` ile yaklaşık sayım yapılmaz.
- [x] Commit: `Tek kullanımlık kapsamlı organizatör ve jüri davetleri`.

## Task 4 — Brevo ve kalıcı e-posta kuyruğu

**Ekle:** `lib/mail/brevo.ts`, `lib/mail/templates.ts`, `lib/mail/worker.ts`, `lib/mail/secrets.ts`, `app/api/cron/mail/route.ts`, `app/api/webhooks/brevo/route.ts`, `tests/mail.test.mjs`, `tests/database-mail.sql`. **Değiştir:** `lib/env.ts`, `.env.example`, README ve cron kurulumu. E-posta hiçbir teslim/mühür transaction'ını veya ana `tick()` bütçesini bekletmez; ayrı cron/lease.

- `mail_outbox`: UUID, unique `dedupe_key`, tür, scope referansları, hedef e-posta, değişmez asgari template verisi, gerektiğinde sürümlü şifreli secret payload, state (`pending|leased|accepted|uncertain|dead|cancelled`), lease token/süre, deneme/sıradaki zaman, provider message ID ve temizlenmiş son hata. Ayrı `mail_events` tablosu provider olaylarını tekilleştirir.
- Davet linki e-posta için gerektiğinden ham token düz metin DB alanına yazılmaz: `MAIL_PAYLOAD_KEY` ile AES-256-GCM; anahtar sürümü + rastgele nonce/tag. Audit, hata ve worker çıktısında payload/token/API anahtarı yok. Kabul/iptal edilmiş veya süresi geçmiş davet e-postası gönderilmez.
- Brevo çağrısı `POST https://api.brevo.com/v3/smtp/email`, `api-key`; açık `sender`, `to`, `subject`, `htmlContent`, `textContent`, ilişkilendirme etiketi. Sağlayıcı adaptörü yalnızca sunucuda; ilk sürüm doğrudan `fetch`, yeni SDK zorunlu değil.
- İçerikler: başvuru alındı, onaylandı, gerekçeli ret, organizatör daveti, jüri daveti. HTML kullanıcı metnini escape eder. Onay/ret ekranında e-posta başarısızlığı başvuru sonucunu geri almaz; durum ve yeniden gönderim yetkili kişiye görünür.
- DB `dedupe_key` kalıcı tekillik sağlar. Provider'ın sınırlı idempotency penceresi kalıcı garanti sayılmaz. Tek gönderim adaptörünün anahtar davranışı Brevo test hesabıyla doğrulanır; batch dokümanındaki TTL tekli gönderime taşınmaz. Timeout sonrası kabulü bilinmeyen mesaj `uncertain` olur; belirsiz eski gönderim körlemesine tekrar edilmez. İşletim ekranında ilişkilendirme ve kontrollü yeniden gönderme vardır; ağ sınırında mutlak exactly-once iddiası yok.
- Bilinen 429/kapasite reddinde `Retry-After`; geçici hatada sınırlı üstel yeniden deneme; alıcı hatası/engellenme terminal. İşçi lease'i devralınabilir ama eski lease tokenı işi tamamlayamaz. E-posta bütçesi 10 saniye/tur ve küçük batch; ana teslim işçisi bağımsız.
- Webhook Brevo'da tanımlanan bearer secret ile korunur; body boyutu/sayı sınırı vardır. `id` alanı tek başına event tekillik anahtarı değildir: message-id + olay tipi + provider zaman/digest ile tekilleştir. Tekrarlı ve sıra dışı olaylar mesajı iki kere teslim etmez veya teslim durumunu geri düşürmez. Sent/accepted, delivered ile ayrı durumdur; opened/clicked takibi kapsam dışıdır.
- Ortam: `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `BREVO_WEBHOOK_SECRET`, `MAIL_PAYLOAD_KEY`; mevcut `CRON_SECRET` ve sunucu site adresi. Secret değerleri belgeye yazılmaz. Alan adı/gönderici hesabı doğrulanmadan gerçek gönderim açılmaz.
- [x] Sahte Brevo ile 201, 400, 429, 5xx/timeout, duplicate webhook, hatalı bearer, expired invite, lease kaybı ve şifre çözme hatası testleri.
- [x] Önceki adımlarda kurulan başvuru/karar/davet outbox kayıtlarını işçiye bağla; kuyruk insert hatasında işlemin de rollback olduğunu tekrar test et. Davet secret payload hazırlama transaction'dan önce, provider çağrısı sonra. Başvuru/karar mesajında secret payload gerekmez; yalnız değişmez scope/template verisi ve alıcı kaydı tutulur.
- [x] Ayrı cron kurulumu ve cron secret kontrolü; kuyruk SQL testleri + `npm run check`.
- [x] Commit: `Brevo işlemsel e-posta kuyruğu ve teslim durumu`.

## Task 5 — Ekranlar ve sunucu eylemleri

**Ekle:** yukarıdaki `/topluluk`, `/katil`, `/yonetim/topluluklar`, `/e/[slug]/juri` sayfaları ve kapsamlı `actions.ts` dosyaları; `components/community-forms.tsx`, `components/invite-forms.tsx`. **Değiştir:** yönetim merkezi, header, davet dönüşü, `getManagementScope`.

- [x] Başvuru sırası: form → salt okunur bekleme → onayda topluluk panosu → etkinlik oluşturma. Otomatik dönüş yalnızca açık `next` yoksa; mevcut ekip/jüri daveti dönüşü ezilmez. Birden çok topluluğu olan kullanıcı topluluk seçer.
- [x] Head admin ekranında sayfalı başvuru/topluluk listesi, ret gerekçesi, askı ve kurtarma. Topluluk sahibi yalnızca kendi iletişim verisini görür; organizatöre gerekli veri kadar gösterilir.
- [x] Jüri davetinde GitHub/LinkedIn seçenekleri; açık rol, etkinlik adı, yarışamama bilgisi ve Kabul et butonu. Önceden üye kullanıcıya neden kabul edemediği gösterilir. Geçersiz/süresi dolmuş davet başka rol bilgisi sızdırmaz.
- [x] Jüri alanı `juri-paketi` iznine göre çalışır; topluluk yönetimi/kilit/ödül formu içermez. Kilitten önce bekleme görünümü; kilitten sonra arşivler. `/yonetim` jüri rolüyle genel yönetim yetkisi kazanmaz.
- [x] Etkinlik oluştururken HTTPS başvuru formu/kurallar/aydınlatma bağlantıları eklenir (`0016` kolonları ve `admin_create_event` uzantısı). Boş başvuru formu isteğe bağlı; kurallar ve aydınlatma yeni toplulukta yayın koşuludur; Plan 4 bağlantı sürümünü kaydeder. Eski RPC geriye uyumlu sarmalayıcıyla korunur, eski etkinliklere uydurma URL yazılmaz.
- [x] Gönderim kilidi, sunucu hatasında taslak, form bazlı geri al ve canlı yenileme koruması; kişi verileri RSC/JSON içine yanlışlıkla taşınmaz.
- [x] Commit: `Topluluk başvuru ve yönetim ekranları ile jüri girişi`.

## Task 6 — Uçtan uca doğrulama ve teslim

- [x] Preview fikstürüne iki topluluk, bekleyen/reddedilen başvuru, GitHub ve LinkedIn-only jüri, geçerli/iptal/süresi dolmuş davet, mail hata durumu ekle. Testler canlı hesaplara yazmaz.
- [x] Rota ve gerçek form testleri: yabancı scope kimliği, diğer kişinin başvurusu, aynı anda çift kabul, GET tarayıcısı, ret sonrası yeniden başvuru, mevcut projenin jüriliği engellemesi, linked identity rolünün korunması.
- [x] `npm run check`, build, `test:db`, routes, browser, event-isolation; 390px ve masaüstü başvuru/davet/pano görüntüleri. Bekleme ve ret metinleri anlaşılır olmalı.
- [ ] LinkedIn uygulamasında OIDC ürünü + Supabase callback/allowlist ve Brevo gönderici/webhook ayarları gerçek hesap sahibi tarafından hazır edilir. Bunlar kod testiyle var sayılmaz. İzinli test alıcısına bir kontrollü gönderim yayın provasında yapılır.
- [ ] Canlı Plan 3 yayın kaydı: migration'lar → uygulama → callback/mail provası. Genel başvuru anahtarı Plan 4–5 kapanana kadar kapalı. Geri alma additive şemayı silmez; başvuru/davet ekranları ve mail cron'u kapatılabilir, mevcut mühür akışı sürer.
- [x] Plan durumunu kanıtlarla güncelle ve yerel commit oluştur. Uzak gönderim/PR ve canlı ayarlar ayrı yetkilendirilmiş teslim adımıdır.

## Resmî teknik kaynaklar · 13 Kasım 2026

- [Supabase LinkedIn OIDC](https://supabase.com/docs/guides/auth/social-sign-in/auth-linkedin): provider adı `linkedin_oidc`.
- [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking): aynı doğrulanmış e-posta ile sağlayıcı bağlanmasının hesabın UUID'sine etkisi uygulama sırasında test edilir.
- [Brevo tekli işlemsel e-posta](https://developers.brevo.com/reference/send-transac-email), [webhook güvenliği](https://developers.brevo.com/docs/secured-webhooks), [olay alanları](https://developers.brevo.com/docs/transactional-webhooks). Uygulama sırasında güncel API tekrar kontrol edilir; fiyat/kota varsayımı sabitlenmez.


## Uygulama ve doğrulama kaydı · 13 Kasım 2026

Uygulama `feat/topluluk-basvuru` dalında, `muhur-coklu` çalışma ağacında tamamlandı. Planlama belgeleri `f27573a`, uygulama ve testler `cbde216`. Task 1–5'in karşılıklı SQL/kimlik/ekran bağımlılıkları tek uygulama commit'inde toplandı; yukarıdaki commit maddeleri bu teslimin kapsamına karşılık gelir. Plan 4–5 kodlanmadı.

- `npm run check`: **101/101 test**, ESLint ve TypeScript başarılı.
- İzole üretim `next build`: başarılı; canlı servis anahtarı kullanılmadı.
- `npm run test:db`: 0016'ya kadar migration zinciri, mevcut veritabanı testleri ve Plan 3 testleri başarılı. İki bağlantıda jüri/organizatör kabulü ↔ yarışmacı kaydı, çift davet tüketimi, iptal ↔ kabul, onay ↔ ret ve erken webhook ↔ gönderim sonucu yarışları geçti. Mail insert hatasında başvuru kararı/sahiplik geri alınıyor.
- `test:community`, `test:routes`, `test:event-isolation`, `test:browser`: başarılı. Başvuran iletişimi organizatöre/yabancı kapsama sızmıyor; eski açık form güncel head admin yetkisi olmadan karar veremiyor. İki ayrı belge onayı, hata sonrası taslak korunması ve LinkedIn jüri alanı doğrulandı.
- Başvuru/davet/topluluk/head admin ekranlarının 1366px ve 390px görüntüleri alındı; yatay taşma yok. Başvuru mobil, davet mobil ve topluluk masaüstü görüntüleri ayrıca gözle incelendi. Adres regex'inin HTML `v` modu uyumu düzeltildi. Impeccable detector yeni ekranlarda bulgu vermedi.
- Planın `tests/community.test.mjs` / `components/invite-forms.tsx` önerileri yerine ilgili kapsam `tests/mail.test.mjs`, `tests/community-browser.mjs`, `tests/community-races.mjs` ve ortak `components/community-forms.tsx` içinde tutuldu.

Canlı Supabase migration geçmişi bu ortamda doğrulanmış veya değiştirilmiş sayılmaz. Başlangıçta uzak `main` `ac44cc9778fa6048cb7829225ab980fdb5c488a8`; uygulama Plan 2'nin yerel kodu üzerine kuruldu. Push, canlı migration, LinkedIn hesabı ayarı, Brevo gönderici/webhook/cron kurulumu ve gerçek alıcıya e-posta yapılmadı. Bunlar yerel test sonucu yerine geçmez. Genel başvuru anahtarı varsayılan **false**; yalnız yerel fikstür **true** kullanır.

Kurulum sırası ve geri alma: `README.md` içindeki Plan 3 bölümü; bağımsız cron: `supabase/cron/plan3_mail.sql`. Ayrıntılı kanıt: [Plan 3 doğrulama kaydı](../verification/2026-11-13-plan3.md).
