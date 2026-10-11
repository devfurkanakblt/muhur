# mühür · 0005 kapanış doğrulaması ve organizatör görevleri · 11 Ekim 2026

4 Ekim incelemesindeki 22 bulgunun (A01–A22) `0005_hardening.sql` ve ona eşlik eden kodla kapanıp kapanmadığı, bugünkü `main` dalı ve canlı sistem üzerinde yeniden doğrulandı. Bu belge, `fix/denetim-a09-a21` dalındaki (PR #1) 9 Ekim rehberinin yerine geçer. O tarihten sonra değişenler aşağıda ayrıca yazılı.

**Sonuç:** 22 bulgunun 20'si `main`'de ve canlı veritabanında kapalı. **A09 ve A21'in düzeltmeleri yazılmış ve test edilmiş, ama PR #1 birleştirilmediği için `main`'de ve canlıda yok.** PR #1 güncel `main` ile çakışmadan birleşiyor; birleşmiş hâlde tip kontrolü, lint ve 47 testin hepsi geçiyor. Ayrıca canlı site 4–5 Ekim kodunu çalıştırıyor: `main`'e giren son dakika düzeltmeleri (PR #2) de henüz yayınlanmadı. Etkinliği engelleyen bir kod sorunu yok. Yapılacaklar aşağıdaki "Şimdi" bölümünde.

## Nasıl doğrulandı

| Kontrol | Sonuç |
|---|---|
| Birim testleri (`npm test`, `main`) | 41/41 geçti |
| Tip kontrolü ve lint (`main`) | Geçti |
| SQL kural testleri (0001–0006 ile boş PostgreSQL 17) | `tests/database.sql` 47, `tests/database-hardening.sql` 57, `tests/database-last-minute.sql` 18 kontrol geçti |
| **Gerçek iki bağlantılı yarış testleri** (9 Ekim'de koşulamamıştı) | Geçti: eşzamanlı çift kayıt tek proje üretir; iki worker aynı işi almaz; davet yenilenirken eski kodlu katılım reddedilir (A04); kuruculuk devri sırasında eski kurucunun silmesi reddedilir (A03); oylama kapanışı devam eden oyu bekler, sonraki oy reddedilir (A06) |
| PR #1 + `main` birleşme denemesi (yerel, push edilmedi) | Çakışma yok; tip kontrolü, lint ve 47/47 test geçti |
| Canlı Supabase (yalnızca okuma sorguları) | Aşağıdaki tablo |
| Canlı site (yalnızca GET) | Aşağıdaki tablo |
| Vercel | Son production yayını ~6 gün önce, CLI ile. Repo Vercel'e git ile bağlı değil: `main`'e birleştirmek siteyi güncellemez. |

**Canlı veritabanı**

| Kontrol | Sonuç |
|---|---|
| Migration geçmişi | `delivery`, `hardening`, `son_dakika` kayıtlı; `delivery_schema_version()` = 6 |
| 0005 + 0006 fonksiyonları | 27 fonksiyonun hepsi mevcut |
| İstemci erişimi | `anon` ve `authenticated` hiçbir fonksiyonu çalıştıramıyor ve hiçbir tabloda yetkisi yok. 13 tablonun hepsinde RLS açık, politika yok, yani bütün erişim sunucudan. |
| Oylama koruması (A06/A07) | `guard_votes` etkinlik satırını `FOR SHARE` kilitliyor ve mühür şartı arıyor |
| Denetim kaydı (A20) | `admin_audit` yalnızca ekleme tetikleyicisine sahip; 3 kayıt var |
| Depolama | `archives` private (50 MB), `logos` public (1 MB; png/jpeg/webp); storage politikası yok |
| Zamanlayıcı | `muhur-tick` her dakika aktif; son 24 saatte 1440/1440 başarılı, HTTP yanıtlarının hepsi 200; son 7 günde `worker_runs` hatası yok; Vault'ta `muhur_cron_secret` var |
| Etkinlik | `ekozeka-2026`, başlangıç 6 Kasım 20:00, son teslim 7 Kasım 20:00 (TR); kilit yok, oylama kapalı, duyuru boş |
| Eserler | Güncel etkinlikte kayıt yok (9 Ekim'deki "muhur test" kaydı temizlenmiş) |
| Kullanıcılar | 1 hesap; GitHub kimliği olmayan hesap yok |

**Canlı site**

| Kontrol | Sonuç |
|---|---|
| Başlıklar | HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` var |
| CSP | Yalnızca `frame-ancestors`, `base-uri`, `object-src`, `form-action` zorunlu. Betik kuralları **Report-Only** modunda; yani A21'in nonce'lu zorunlu CSP'si canlıda değil. |
| `/api/cron/tick` (anahtarsız) | 401 |
| `/yonetim` (girişsiz) | 404 |
| `/api/juri/ekozeka-2026` (girişsiz) | 403 |

## Bulgu bulgu sonuç

| Kimlik | `main` / canlı | Kanıt |
|---|---|---|
| A01 Yönetici yetkisi | Kapandı | Yetki sabit sayısal GitHub kimliğine (`ADMIN_GITHUB_IDS`) bağlı; `user_metadata` kullanılmıyor. Birim testleri. |
| A02 Repo sahiplenme | Kapandı | Sahip kimliği eşleşmesi ya da token sahibinin push izni. Birim testleri. |
| A03 Üyelik/kuruculuk yarışı | Kapandı | Aktörlü atomik RPC'ler; **iki bağlantılı yarış testi bu kez koşuldu ve geçti** |
| A04 Davet yenileme yarışı | Kapandı | `join_project_by_code` proje satırını kodla kilitliyor; **yarış testi geçti** |
| A05 Sınırsız tekrar arşiv | Kapandı | Aynı commit `already_accepted`; proje başına 10 dakikada 6 iş; eski kabullerden en yeni 3'ü tutuluyor |
| A06 Oylama kapanış yarışı | Kapandı | `FOR SHARE` kilidi canlıda doğrulandı; **yarış testi geçti** |
| A07 Teslimsiz projeye oy | Kapandı | Yalnızca mühürlü eser aday; `vote_tallies` aynı şartla sayıyor |
| A08 Yanlış başarı yanıtı | Kapandı | `queued` / `busy` / `already_accepted` / `rate_limited` ve istenen/sıradaki/kabul edilen SHA ayrı. 0006 ile bekleyen eski sürüm yerini yenisine bırakıyor (`supersededSha`). |
| **A09 Hata = boş sonuç** | **Kısmen.** Kalanlar PR #1'de | Veri okumaları ve `lookupSeal` hata fırlatıyor. Panel repo listesi, panel repo kontrolü, yönetim tablosu/zamanlayıcı/iş listesi ve sergi sayıları hâlâ hatayı "yok" gibi gösterebiliyor; düzeltmeleri PR #1'de. |
| A10 Eksik mühür doğrulamada | Kapandı | Yalnızca `archive_sha256` dolu kayıtlar sonuç; kısa önek ayrı |
| A11 ZIP yapısı | Kapandı | `lib/zip-check.ts`; birim testleri; stres testinde uygulamanın kendi doğrulayıcısı her arşivde çalıştı |
| A12 Kilit sonrası indirme | Kapandı | Kilitli etkinliğin teslim işleri indirilmeden kapanıyor; mühür işleri önce |
| A13 Okunabilir çerezde token | Kodda kapandı | Oturum çerezleri HttpOnly. Canlıda tarayıcıdan bir kez bakılmalı (organizatör listesi). |
| A14 Sahte logo | Kapandı | `sharp` ile çözme ve yeniden kodlama; birim testi |
| A15 Jüri paketi blokajı | Kapandı | `?paket=gecerli` / `?paket=eksiksiz` |
| A16 Form ve canlı yenileme | Kapandı | 4 Ekim arayüz raporu ve birim testleri |
| A17 Satır sınırında oy toplamı | Kapandı | `vote_tallies` veritabanında sayıyor; listeler sayfalı |
| A18 Yardımcı işler kuyruğu etkiliyor | Kapandı | Kritik akış önce, yardımcı işler kira ve bütçe altında. 0006 sonrası mühür kuyruğu kilitten sonra tek turda boşalıyor. |
| A19 Anonimleştirme | Kapandı (hukuki değerlendirme yapılmadı) | `anonymize_user` ve yönetim formu |
| A20 Aktörlü denetim kaydı | Kapandı | Yalnızca ekleme yapılabilen `admin_audit`. Kayıt yönetim panelinde görünmüyor; Supabase tablo düzenleyicisinden okunuyor. |
| **A21 Başlıklar ve oturum sertleştirmesi** | **Kısmen.** Kalanlar PR #1'de | Temel başlıklar canlıda var. Nonce'lu zorunlu CSP ve geri alınamaz yönetim işlemleri için "son 12 saatte açılmış oturum" şartı yalnızca PR #1'de. Yönetici hesabında 2FA açık. |
| A22 Depoda sahipsiz dosya | Kapandı | Telafi, yazmadan önce iş durumu kontrolü, 24 saatlik depo temizliği |

## 9 Ekim'den bu yana değişenler

- **Çözüldü:** Canlıdaki "muhur test" deneme kaydı ve "demo" duyurusu kaldırılmış.
- **Eklendi (0006, canlıya uygulandı, kodu `main`'de, yayında değil):** son dakika stres testinden çıkan düzeltmeler.
  - Geçici bir GitHub/depo hatası artık ekibin son sürümünü kaybettirmiyor: aynı iş içinde yeniden deneme, sonra en fazla 10 sn bekleme ve takip denemesi.
  - Sırada bekleyen eski sürüm yerini yenisine bırakıyor; düğme yalnızca iş gerçekten işlenirken kilitli.
  - Kilitten sonra bütün mühürler ilk zamanlayıcı turunda tamamlanıyor. Önceden 50 eser için ~7 dk, 150 eser için ~19 dk sürüyordu.
  - Kayıp arşiv hemen yönetici incelemesine düşüyor.
- **Ölçüldü:** 50 proje ve son 2 dakikada yoğun güncelleme altında hiçbir kural bozulmadı. Süre sonrası kabul, yanlış hash, çift işleme, bozuk ya da kayıp arşivin mühürlenmesi görülmedi. Arşivleme genellikle 1–3 sn sürüyor (p99 ~5 sn). **Son 10 saniyede istenen güncellemenin yetişmesi garanti değil.** `npm run test:stress` ile tekrarlanabilir.
- **Doğrulandı:** A03, A04 ve A06 için gerçek eşzamanlılık testleri (yukarıda).

## Hâlâ açık olan, sistemin uygulamadığı kurallar

| Konu | Bu etkinlik için elle çözüm |
|---|---|
| **Başlangıç saati uygulanmıyor:** kayıt ve teslim yalnızca kilide bakıyor | 6 Kasım 20:00'den önce oluşan kayıtları `/yonetim` tablosunda not edin; kuralı önceden duyurun |
| GitHub erişim çerezi (`gh_token`) 12 saat yaşıyor | "GitHub oturumunun süresi dolmuş" uyarısında çıkış yapıp yeniden giriş |
| Ekip büyüklüğü sınırı yok | Tablodaki üye listesinden takip; fazla üyeyi kurucuya çıkarttırın (yönetici üye çıkaramaz) |
| Eser gizleme / diskalifiye yok | Kilitten önce ekibe düzelttirin; kilitten sonra ödül vermeyin, jüri notuna yazın |
| Jüri rolü yok | Jüri paketini yönetici indirir, jüri koordinatörü dağıtır |
| Oylamada sahte hesap koruması yok | Oylamayı salonda ve kısa süreli açın; ilan öncesi şüpheli oylarda hesap yaşına bakın |
| Deneme etkinliği yok | Kuru provayı güncel etkinlikte, kilitlemeden yapın ve deneme kayıtlarını geri çekin |

## Organizatör görevleri

Etkinlik: **EkoZeka Hackathon** (`ekozeka-2026`). Başlangıç **6 Kasım 2026 Cuma 20:00**, son teslim **7 Kasım 2026 Cumartesi 20:00** (Türkiye saati). En fazla 50 katılımcı ve 50 proje.

### Roller

Yönetici yetkisi (`ADMIN_GITHUB_IDS`) **tek kişide**: Furkan'ın kişisel GitHub hesabı (2FA açık). `/yonetim` sayfasındaki her işlem ondan geçer. Diğer organizatörler bu sayfayı açtığında 404 görür; bu normaldir.

| Rol | Kim | Görev |
|---|---|---|
| Yönetici | Furkan | Zamanlama ve süre uzatma, duyuru, iş kuyruğu, oylama, ödüller, jüri paketi, yeni etkinlik, kişisel veri silme. Kilit 20:00'de kendiliğinden vurulur; "Mührü vur" düğmesine basılmaz. Son saatte bilgisayarın başında. |
| Ekip masası | (atanacak) | Teslim sorunu yaşayan ekiplerle yüz yüze ilgilenir; "Sorun anında" tablosundaki adımları ekibe kendi panelinden yaptırır. Yönetici işlemi gerekirse yöneticiye iletir. |
| Sahne ve duyuru | (atanacak) | `/sahne` ekranı (herkes açabilir), sözlü anonslar, Telegram grubu. Duyuru şeridi metnini yöneticiye iletir. |
| Gözlemci | (atanacak) | Vitrini ve sahneyi izler; kayıt sayısını, uygunsuz içeriği, ekip büyüklüğü ihlallerini ve 20:00 öncesi kayıtları not eder. |
| Jüri koordinatörü | (atanacak) | Yöneticinin indirdiği jüri paketini ve CSV'yi jüriye dağıtır; jüri kararlarını ve ödül gerekçelerini toplar. |
| Yedek yönetici erişimi | (atanacak) | Vercel projesine erişimi olan kişi. Yönetici hesabına erişim kaybolursa ikinci bir sayısal GitHub kimliğini `ADMIN_GITHUB_IDS`'e ekleyip yeniden yayınlar (birkaç dakika). Kilit ve mühürleme bu sırada kendiliğinden işlemeye devam eder. |

### Şimdi: yayın (yönetici)

- [ ] **PR #1'i birleştirin** (A09 ve A21): https://github.com/devfurkanakblt/muhur/pull/1. Güncel `main` ile çakışma yok, birleşmiş hâlde testler geçiyor.
- [ ] **Yayınlayın:** repo Vercel'e git ile bağlı olmadığı için birleştirmek yetmez. `main`'de `npx vercel deploy --prod`. Bu yayınla PR #1 ve PR #2 birlikte canlıya çıkar. Veritabanı (0006) zaten hazır.
- [ ] Yayından sonra kontrol:
  - Canlı sayfanın yanıtında `content-security-policy` başlığı `nonce-` içermeli.
  - Tarayıcı konsolunda "Refused to" hatası olmamalı.
  - `/yonetim` üstünde oturum tazeliği satırı görünmeli.
- [ ] İsteğe bağlı: `vercel env pull .env.local` sonrası `npm run check:schema` "0006 erişilebilir" demeli.

### Kurulum (etkinlikten en geç 1 hafta önce)

- [ ] Vercel'de `ADMIN_GITHUB_IDS` yalnızca Furkan'ın sayısal GitHub kimliğini içersin (`https://api.github.com/users/<kullanıcı-adı>` yanıtındaki `id`). Furkan `/yonetim`'i açabilsin, başka bir organizatör açamasın (404).
- [x] Yönetici GitHub hesabında 2FA açık.
- [ ] `GITHUB_TOKEN`'ın son kullanma tarihi 7 Kasım'dan en az iki hafta sonra olsun. Token düşerse teslim alınamaz.
- [ ] Supabase → Authentication → Providers: yalnızca **GitHub** açık kalsın; e-posta/şifre girişini kapatın.
- [ ] Supabase Redirect URL'lerinde canlı adresin `/auth/callback` yolu olsun; GitHub OAuth App callback'i Supabase'i göstersin.
- [ ] `NEXT_PUBLIC_SITE_URL` canlı adres olsun. Alan adı değişirse `0003_cron.sql` içindeki URL'yi ve Vault'taki `muhur_cron_secret`'ı da güncelleyin.
- [ ] Telegram: bot grupta, `TELEGRAM_CHAT_ID` doğru. Deneme duyurusuyla mesajın gruba geldiğini görün. Katılımcıları gruba önceden alın.
- [ ] `CONTACT_EMAIL` kulüp adresi olsun; `/gizlilik` metnini bir kez okuyun.
- [ ] Giriş yapıp tarayıcı geliştirici araçlarında Application → Cookies: `sb-…` ve `gh_token` çerezleri **HttpOnly** olsun (A13 canlı kontrolü).
- [ ] Yedek: Supabase planınızın yedek kapsamını kontrol edin. Veritabanı yedeği Storage'daki arşivleri kapsamaz; etkinlik sonrası jüri paketini ayrıca saklayın.
- [ ] Rolleri yukarıdaki tabloda isimlendirin; yedek yönetici erişimini kimin yapacağını kararlaştırın.

### Kuru prova (başlangıçtan önce, güncel etkinlikte, kilitlemeden)

- [ ] Bir organizatör deneme reposunu içe aktarsın, diğeri davet bağlantısıyla katılsın.
- [ ] Yeni commit push → panelde "Teslim sürümünü güncelle" → kabul edilen SHA yeni commit olmalı. Birkaç saniye içinde kabul görülmeli.
- [ ] Arka arkaya iki push yapıp ikisini de teslim edin: ikinci sürüm birincinin yerine geçmeli ("bekleyen … sürümünün yerini aldı").
- [ ] Kabul edilmiş arşivi panelden indirin; SHA-256 panelde gösterilenle aynı olsun.
- [ ] `/sahne` sayfasını projektörde açın; QR kodunu birkaç telefonla okutun.
- [ ] **Yapmayın:** "Mührü vur", son teslimi geçmişe çekmek, oylamayı açmak. Bunlar geri alınamaz. Mühür, jüri paketi ve oylama yalnızca yerelde (`npm run preview:test`) prova edilir.
- [ ] Prova bitince deneme kayıtlarını panelden geri çekin. İlk gerçek ekip No. 001 almalı.

### Etkinlikten 1 gün önce

- [ ] `/yonetim` → Zamanlama: 6 Kasım 20:00 / 7 Kasım 20:00.
- [ ] `/yonetim` → "Son başarılı çalışma" bir dakikadan eski olmasın.
- [ ] Güncel etkinlikte deneme kaydı kalmadığını kontrol edin.
- [ ] Katılımcılara duyurulacak kurallar:
  - Repo public olmalı, proje başına tek repo, varsayılan daldaki kod teslim edilir.
  - Arşiv en fazla 50 MB.
  - **Her push'tan sonra panelde "Teslim sürümünü güncelle"** ve "kabul edildi" görülmeli. Kayıt olmak teslim etmek değildir.
  - **Son 10 saniyeye bırakmayın:** arşivleme birkaç saniye sürer ve 20:00'den önce doğrulanmış olmalı.
  - 10 dakikada en fazla 6 teslim.
  - Ekip büyüklüğü sınırı ve başlangıç öncesi kod yasağı (sistem uygulamaz, organizatörler denetler).
  - Kurucu değişikliği, üye çıkarma, davet yenileme yalnızca kilitten önce.

### Etkinlik günü

**Başlangıç (6 Kasım 20:00)**
- [ ] Yönetici 19:00 civarı `/yonetim` → "GitHub ile yeniden giriş yap". Geri alınamaz işlemler 12 saat açık kalır (PR #1 yayınlandıysa).
- [ ] Duyuru şeridi ve Telegram'da başlangıç mesajı.
- [ ] 20:00'den önce oluşmuş kayıtları not edin.

**Etkinlik süresince**
- [ ] "Kod teslimi bekleniyor" yazan ekipleri düzenli takip edin.
- [ ] "Repo başlangıçtan önce açılmış" ve "Başlangıçtan önce tarihli commit" işaretleri kanıt değil, ipucudur; jüri notuna yazın.
- [ ] Uygunsuz ad, özet ya da logo: kilitten önce ekipten düzeltmesini isteyin.
- [ ] İş kuyruğunda "Başarısız" görünen iş için "Tekrar dene". Zamanlayıcı satırı kırmızıysa "Kuyruğu şimdi işle".

**Son 3 saat (7 Kasım 17:00–20:00)**
- [ ] Yönetici 17:00'de yeniden giriş yapsın: süre uzatma 20:00'de açık olur, oylama ve sonuç açıklama 8 Kasım 05:00'e kadar açık kalır.

**Son saat**
- [ ] Telegram hatırlatmaları 19:00 ve 19:45'te kendiliğinden gider.
- [ ] 19:00, 19:30, 19:45 ve 19:55'te sözlü anons: "Push et, panelde teslim sürümünü güncelle, kabul edildiğini gör. Son 10 saniyeye bırakma."
- [ ] Hâlâ kabul edilmiş sürümü olmayan ekiplerin masasına bizzat gidin.
- [ ] **Süre uzatma yalnızca 20:00'den önce:** `/yonetim` → Zamanlama. Son teslim geçtikten sonra uzatılamaz. GitHub kesintisinde kararı 20:00'den önce verin.

**20:00, kilit**
- [ ] Kilit kendiliğinden vurulur; "Mührü vur" düğmesine basmayın.
- [ ] Mühürler kilitten sonraki ilk dakika içinde tamamlanmalı (yeni sürüm yayındaysa). `freeze_error` görünen satırda "Tekrar dene".
- [ ] "Süre dolmadan kabul edilmiş teslim sürümü yok" yazan ekip teslim etmemiştir; kural gereği değiştirilemez, ekibe açıkça söyleyin.

### Kilitten sonra

- [ ] **Jüri paketi:** `/yonetim` → "Mühürlü teslimler ZIP" ve "CSV listesi"; jüri koordinatörüne verin. Sınır 500 MB.
- [ ] **Diskalifiye kararı oylamadan önce:** sistemde diskalifiye yok; mühürlü her eser aday olur. Diskalifiye edilene ödül vermeyin, jüri notuna yazın.
- [ ] **Halkın seçimi:** "Oylamayı aç". Her GitHub hesabı bir oy, kendi ekibine oy yok. Salonda kısa süreli açın. "Kapat ve sonuçları açıkla" geri alınamaz.
- [ ] **Ödüller:** yalnızca mühürlü eserlere; gerekçe 10–280 karakter.
- [ ] **Arşivleri saklayın:** jüri paketi ve CSV'yi kulübün kendi deposuna da koyun.
- [ ] **Yeni etkinlik:** bütün mühürler tamamlanmadan açmayın.
- [ ] **KVKK başvurusu:** `/yonetim` → Kişisel veri silme.
- [ ] Etkinlikten sonra gerekmiyorsa Telegram bot token'ını ve `GITHUB_TOKEN`'ı iptal edin.

### Sorun anında

| Durum | Ne yapılır |
|---|---|
| "Repom listede yok" | Listenin altındaki "Listede yok mu?" kutusuna repo bağlantısını yapıştırsın. Repo public mi, başka ekip almış mı, bakın. |
| "GitHub oturumunun süresi dolmuş" | Çıkış yapıp yeniden giriş. |
| "Bu repoya yazma yetkin görünmüyor" | Repo sahibi ya da push yetkisi olan üye içe aktarsın. |
| Teslim reddedildi | Panel mesajını okuyun: 50 MB, private repo, boş dal ya da 10 dakikada 6 teslim kotası. Önceki kabul edilmiş sürüm korunur. |
| "Önceki sürüm hâlâ işleniyor" | Birkaç saniye bekleyip tekrar teslim etsin. Düğme yalnızca iş gerçekten işlenirken kilitli. |
| "Önceki deneme geçici bir hatayla durdu" | Sistem birkaç saniye içinde kendisi yeniden dener. Beklemek istemiyorsa ya da yeni push yaptıysa yeniden "Teslim sürümünü güncelle". |
| Zamanlayıcı durdu | `/yonetim` → "Kuyruğu şimdi işle". Supabase'te `cron.job` ve `cron.job_run_details`. Son teslimden sonraki ilk ana sayfa ziyareti de kilidi yazar. |
| GitHub kesintisi | Kabul edilmiş son sürümler geçerlidir. Gerekirse 20:00'den önce herkes için süre uzatın. |
| Site erişilemiyor | Kabul kayıtları veritabanında; kaybolmaz. Vercel durumuna bakın. |
| Yanlışlıkla erken kilit | Geri alınamaz. Bu yüzden düğme tek kişide. |
| Uygunsuz içerik (kilitten önce) | Ekipten düzeltmesini isteyin. Son çare Supabase tablo düzenleyicisi; bu `admin_audit`'e düşmez, not alın. |

## Geliştirici notları

- `npm run test:db` eşzamanlılık testleri `psql` istiyor; bu makinede yok. Bu doğrulamada aynı senaryolar `pg` istemcisiyle koşuldu. `test-db.mjs`'nin `psql` bağımlılığı `stress-seal.mjs`'deki gibi kaldırılabilir.
- 9 Ekim notundaki "temiz kurulumda `tsc` için önce `next typegen`" uyarısı geçerli.
- `audit/reproduce-*.mjs` düzeltme öncesi davranışı gösterir; regresyon testi değildir.
- README'deki "0004 canlıya uygulanmış sayılmaz" notu eski: 0004, 0005 ve 0006 canlıda kayıtlı.
