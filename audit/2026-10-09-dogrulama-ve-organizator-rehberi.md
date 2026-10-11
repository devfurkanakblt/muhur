# mühür · denetim kapanış doğrulaması ve organizatör rehberi · 9 Ekim 2026

4 Ekim incelemesindeki 22 bulgunun (A01–A22) `0005_hardening.sql` ve ona eşlik eden kod değişiklikleriyle kapanıp kapanmadığı yeniden kontrol edildi. Ardından canlı Supabase projesi ve canlı site salt okunur olarak incelendi.

**Sonuç:** 22 bulgunun hepsi kapandı. İlk doğrulamada açık kalan A09 ve A21 aynı gün kapatıldı (aşağıdaki "A09 ve A21 düzeltmesi" bölümü); bu düzeltmeler henüz canlıya yayınlanmadı. Migration canlıda uygulanmış ve canlı site yeni sürümü çalıştırıyor. Kod tarafında etkinliği engelleyen bir sorun bulunmadı. Ancak canlı veritabanında etkinlik öncesinde temizlenmesi gereken deneme verisi var, ayrıca bazı hackathon kuralları sistemde değil organizatörün elinde. İkisi de aşağıda.

## Nasıl doğrulandı

| Kontrol | Sonuç |
|---|---|
| Kod okuma | `0005_hardening.sql` tamamı; `lib/identity.ts`, `lib/data.ts`, `lib/github.ts`, `lib/freeze.ts`, `lib/delivery*.ts`, `lib/zip-check.ts`, `lib/logo-image.ts`, `lib/storage-sweep.ts`, `app/actions.ts`, `app/api/juri`, `app/api/arsiv`, `app/dogrula/actions.ts`, `proxy.ts`, `next.config.ts`, auth callback |
| `npm run test` | 38/38 geçti (A01, A02, A11, A14, A16 için adlandırılmış regresyon testleri dahil) |
| `npm run lint` | Geçti |
| `tsc --noEmit` | `next typegen` sonrasında geçti (bkz. geliştirici notları) |
| `npm audit --omit=dev` | 0 açık. Önceki incelemede registry hatası yüzünden tamamlanamamıştı. |
| Canlı Supabase (salt okunur SQL) | `delivery` ve `hardening` migration'ları kayıtlı. 0005'in 18 fonksiyonu mevcut. `guard_votes` mühür şartı ve `FOR SHARE` kilidi içeriyor. `enqueue_submission` kotayı içeriyor. `anon`/`authenticated` rolleri RPC çalıştıramıyor. `admin_audit` yalnızca ekleme tetikleyicisi var. 13 tablonun hepsinde RLS açık ve politika yok, yani istemci erişimi tamamen kapalı (tasarım gereği; bütün okuma ve yazmalar sunucuda). `archives` bucket private (50 MB), `logos` public (1 MB, png/jpeg/webp). Vault'ta `muhur_cron_secret` var. |
| Canlı zamanlayıcı | `muhur-tick` her dakika aktif; son 24 saatte 1440/1440 başarılı, `worker_runs` içinde son 24 saatte ve 7 günde hata yok |
| Canlı site | Güvenlik başlıkları (CSP, HSTS, X-Frame-Options, nosniff) yanıtta var. `/api/cron/tick` anahtarsız istekte 401, `/yonetim` giriş yapmamış ziyaretçiye 404 dönüyor. |

**Bu oturumda yapılamayanlar:**

- `npm run test:db` çalışmadı: `C:\Program Files\PostgreSQL\16` klasörü boş, PostgreSQL ikili dosyaları yok. Bu yüzden eşzamanlılık bulguları (A03, A04, A06) yalnızca kod ve canlı fonksiyon tanımları okunarak doğrulandı; iki bağlantılı yarış testleri bu oturumda koşulmadı.
- `audit/reproduce-code.mjs` düzeltme öncesi koda göre yazılmış (`@/lib/identity` modülünü tanımıyor) ve çalışmıyor. Yerine geçen regresyonlar `tests/*.test.mjs` içinde.
- Gerçek GitHub girişi, tarayıcıda çerez incelemesi, gerçek cihaz ve projektör, son dakika yük testi yapılmadı.

## Bulgu bulgu sonuç

| Kimlik | Durum | Kanıt |
|---|---|---|
| A01 Yönetici yetkisi | Kapandı | Yetki, `identities` kaydındaki sabit sayısal GitHub kimliğine (`ADMIN_GITHUB_IDS`) bağlı (`lib/identity.ts`). `user_metadata` kullanılmıyor. GitHub kimliği olmayan hesap oturum almıyor. 3 birim testi. |
| A02 Repo sahiplenme | Kapandı | `claimDecision`: ya repo sahibinin kimliği oturumla eşleşir ya da token sahibi oturumdaki kişidir ve push izni vardır. 2 birim testi. |
| A03 Üyelik/kuruculuk yarışı | Kapandı (eşzamanlılık testi bu oturumda koşulmadı) | `update_project`, `withdraw_project`, `remove_member`, `renew_invite`, `leave_project`, `transfer_project_owner` RPC'leri. Sıra: event `FOR SHARE` → project `FOR UPDATE` → yetki kontrolü ve yazma, hepsi tek transaction'da. |
| A04 Davet yenileme yarışı | Kapandı (aynı not) | `join_project_by_code` proje satırını `invite_code = p_code` koşuluyla kilitliyor; yenileme de aynı satırı kilitlediği için eski kod beklese bile reddediliyor. |
| A05 Sınırsız tekrar arşiv | Kapandı | Aynı commit `already_accepted` dönüyor. Proje başına 10 dakikada en fazla 6 iş. Eski kabul arşivlerinden en yeni 3'ü tutuluyor; kayıtlar silinmiyor. |
| A06 Oylama kapanış yarışı | Kapandı (aynı not) | `guard_votes` etkinlik satırını `FOR SHARE` kilitliyor; sonuçlandırma güncellemesi devam eden oyları bekliyor. Canlı tanımda doğrulandı. |
| A07 Teslimsiz projeye oy | Kapandı | Yalnızca `archive_sha256` dolu eser aday. `vote_tallies` da aynı şartla sayıyor. |
| A08 Yanlış başarı yanıtı | Kapandı | `queued` / `busy` / `already_accepted` / `rate_limited` durumları ve istenen/sıradaki/kabul edilen SHA ayrı ayrı. Panel mesajları bunları gösteriyor. |
| A09 Hata = boş sonuç | Kapandı (9 Ekim düzeltmesiyle) | Veri okumaları hata fırlatıyor (`readFailed`), `lookupSeal` hata fırlatıyor. İlk doğrulamada kalan yerler (panel repo listesi ve repo kontrolü, yönetim tablosu, zamanlayıcı ve iş listesi, sergi sayıları) düzeltildi. |
| A10 Eksik mühür doğrulamada | Kapandı | Yalnızca `archive_sha256` dolu kayıtlar sonuç olarak dönüyor; kısa önek tam eşleşmeden ayrılıyor. |
| A11 ZIP yapısı | Kapandı | `lib/zip-check.ts`: merkezi dizin, ZIP64, CRC, açılabilirlik, güvensiz yol, üst üste binen girdi, giriş sayısı ve açılmış boyut sınırları. 5 birim testi. |
| A12 Kilit sonrası indirme | Kapandı | `claim_delivery_jobs`, kilitli etkinliğin teslim işlerini indirmeden kapatıyor ve mühür işlerini önce alıyor. |
| A13 Okunabilir çerezde token | Kodda kapandı | Oturum çerezleri `httpOnly` (`lib/supabase/server.ts`, `proxy.ts`); tarayıcıda Supabase istemcisi yok. Canlıda tarayıcıdan bir kez bakılmalı (aşağıdaki kurulum listesi). |
| A14 Sahte logo | Kapandı | `sharp` ile gerçek çözme, tür eşleşmesi, yeniden kodlama, meta veri temizliği. Birim testi. |
| A15 Jüri paketi blokajı | Kapandı | `?paket=gecerli` ve `?paket=eksiksiz` ayrı; dışarıda kalanlar nedeniyle manifest ve CSV'de. Sayfalı okuma. |
| A16 Form ve canlı yenileme | Kapandı | Form bazlı taslak takibi, ortak yenileme koordinatörü, sunucu saati eşitlemesi. Birim testleri ve 4 Ekim arayüz raporu. |
| A17 Satır sınırında oy toplamı | Kapandı | Toplamlar `vote_tallies` ile veritabanında sayılıyor; eser ve jüri listeleri `selectAll` ile sayfalı okunuyor. |
| A18 Yardımcı işler kuyruğu etkiliyor | Kapandı | `tick` önce teslim/kilit/mühür kuyruğunu çalıştırıyor. Yardımcı işler kira altında, ayrı hata yakalamayla ve 35 saniyelik bütçeyle çalışıyor; sonuçları `worker_runs.details` alanına yazılıyor. |
| A19 Anonimleştirme | Kapandı (hukuki değerlendirme yapılmadı) | `anonymize_user` RPC'si, Auth hesabının yumuşak silinmesi ve yönetim panelindeki form. |
| A20 Aktörlü denetim kaydı | Kapandı | Yalnızca ekleme yapılabilen `admin_audit`: zamanlama, duyuru, oylama, kilit, etkinlik değişimi, ödül, tekrar deneme, kuyruk çalıştırma, anonimleştirme. **Eksik:** kayıt yönetim panelinde görünmüyor; Supabase tablo düzenleyicisinden okunuyor. |
| A21 Başlıklar ve oturum sertleştirmesi | Kapandı (9 Ekim düzeltmesiyle) | Sayfalarda her istekte yeni nonce'lu zorunlu CSP; API yanıtlarında ayrı katı politika. Geri alınamaz yönetim işlemleri son 12 saatte açılmış oturum istiyor. Yönetici GitHub hesabında 2FA açık. |
| A22 Depoda sahipsiz dosya | Kapandı | Logo yükleme hatasında telafi, geri çekmede yolların toplanması, iş yazmadan önce `delivery_job_state` kontrolü, 24 saatten eski referanssız dosyaları silen depo temizliği. |

İncelemenin "yayın öncesi" listesindeki 7. madde (yedek ve geri yükleme provası) ve 9. maddenin bir kısmı (yük testi, gerçek cihaz) kodla kapanmaz; organizatör listesinde yer alıyor.

## Bu doğrulamada ortaya çıkanlar

1. **Canlı etkinlikte deneme kaydı var.** `EkoZeka Hackathon` etkinliğinde "muhur test" adlı eser No. 001 olarak duruyor ve kabul edilmiş bir teslimi var. Kilitten sonra hiçbir yoldan silinemez: vitrinde, jüri paketinde ve oylamada kalır. Etkinlikten önce geri çekilmeli.
2. **Canlı duyuru "demo".** Sitenin üst şeridinde şu an "demo" yazıyor.
3. **Başlangıç saati sunucuda uygulanmıyor.** Kayıt ve teslim kabulü yalnızca kilide bakıyor (`register_project`, `enqueue_submission`). Bir ekip 6 Kasım 20:00'den önce kayıt olup kodunu kabul ettirebilir. Deneme kaydı da bu yüzden yapılabildi.
4. **GitHub erişim çerezi 12 saat yaşıyor** (`gh_token`). 24 saatlik etkinlikte, repo sahibi olmayan bir ekip üyesi geç saatte içe aktarma yaparsa "GitHub oturumunun süresi dolmuş" uyarısı alabilir. Çözüm: çıkış yapıp yeniden girmek.
5. **Repo listede görünmüyorsa** (GitHub hatası ya da organizasyonda 100'den fazla repo) repo seçicinin altındaki "Listede yok mu?" kutusuna reponun bağlantısı yapıştırılır. İlk sürümde bu kutunun olmadığını yazmıştım; yanlıştı, kutu zaten vardı.
6. **Sistemde karşılığı olmayan kurallar:** ekip büyüklüğü sınırı, eser gizleme veya diskalifiye, jüri rolü, oylamada sahte hesap koruması. Bunları organizatörler elle yönetecek (aşağıdaki "Açık kararlar" bölümü).

## A09 ve A21 düzeltmesi (9 Ekim)

**A09: hata artık "yok" gibi gösterilmiyor.**

| Yer | Önce | Şimdi |
|---|---|---|
| Panel repo listesi (`app/panel/page.tsx`) | GitHub hatasında "Hesabında public repo bulunamadı." | "GitHub'dan repo listen alınamadı" uyarısı; bağlantı yapıştırma kutusu çalışmaya devam eder |
| Panelde seçilen repo kontrolü | Her hata "Repo bulunamadı" | Yalnızca 404 "bulunamadı"; diğer hatalar "GitHub'a şu an ulaşılamadı" |
| Yönetim eser tablosu, oy sayısı, zamanlayıcı ve iş listesi (`app/yonetim/page.tsx`) | Okuma hatasında "Henüz eser yok", "Henüz başarılı zamanlayıcı çalışması yok" | Hata ekranı ve tekrar dene. Eser tablosu sayfalı okunuyor (1000 satır sınırı). |
| Sergi sayıları (`app/sergiler/page.tsx`) | Hata ya da 1000 satır sınırında eksik/0 sayım | Sayfalı okuma; hata ekranı |

**A21: zorunlu CSP ve yönetici oturum tazeliği.**

- `proxy.ts` her sayfa isteğine yeni bir 128 bit nonce üretiyor. Politika (`lib/csp.ts`): betikler yalnızca nonce ile ve `'strict-dynamic'`; `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action` yalnızca site, Supabase ve GitHub; üretimde `upgrade-insecure-requests`. Next.js kendi betiklerine nonce'u kendisi ekliyor; satır içi tema betiği nonce'u `x-nonce` başlığından alıyor (`app/layout.tsx`). Eski rapor modundaki politika kaldırıldı.
- `style-src` içinde `'unsafe-inline'` kaldı: arayüzde 21 yerde `style` özniteliği var ve nonce öznitelikleri kapsamaz. Bu izin betik çalıştırmaya izin vermez.
- API yanıtlarına (`/api/arsiv`, `/api/juri`, `/api/durum`, `/api/sahne`, `/api/cron`) `default-src 'none'` politikası `next.config.ts` içinden veriliyor. Rozet ve QR SVG'leri `<img>` olarak gömüldüğü için hariç.
- Geri alınamaz ya da etkinliği doğrudan değiştiren beş yönetim işlemi (Mührü vur, zamanlama, oylama aç/kapat, yeni etkinlik, kişisel veri silme) **son 12 saat içinde açılmış oturum** istiyor. Oturumun açılış zamanı Supabase'in doğruladığı JWT'deki `amr` kaydından okunuyor; oturum tazelense de, başka bir cihazdan giriş yapılsa da değişmiyor. Çalınmış eski bir oturum çereziyle bu işlemler yapılamaz. Yönetim sayfası tazeliğin ne zaman biteceğini gösteriyor; son üç saatte ve süre dolunca "GitHub ile yeniden giriş yap" düğmesi çıkıyor.
- Sınır: GitHub'da oturum zaten açıksa yeniden giriş şifre sormadan tamamlanabilir. Bu kontrol çalınmış site oturumunu sınırlar; hesabın kendisini 2FA korur.

**Doğrulama:**

| Kontrol | Sonuç |
|---|---|
| `npm run test` | 44/44 (yeni: oturum zamanı ve tazelik için 2, CSP için 4 test) |
| ESLint, TypeScript | Geçti |
| Örnek verilerle üretim derlemesi (`next build` + `next start`) | Bütün sayfalar dinamik; sayfa yanıtında tek CSP başlığı; bütün `<script>` etiketleri başlıktaki nonce'u taşıyor |
| Headless Chrome, 9 sayfa (ana sayfa, panel, sergiler, gizlilik, doğrula, sahne, eser, 404, yönetim) | Hiç CSP ihlali yok; hepsi hidrasyonu tamamlıyor; nonce'lu tema betiği çalışıyor |
| Yönetici oturumu | Taze oturumda zamanlama formu kontrolden geçiyor; 13 saatlik oturumda sunucu yeniden giriş mesajıyla reddediyor |
| `test:routes`, `test:live-browser`, `test:browser` (üretim önizlemesinde) | Hepsi geçti (9 + 7 + 8 kontrol) |

Test düzeneği (`tests/preview.mjs`) iki konuda güncellendi: sahte JWT'nin imzası geçerli base64url yapıldı (Supabase'in `getClaims` doğrulaması bunu istiyor) ve `?oturum=eski` ile eski oturum üretilebiliyor. `MUHUR_PREVIEW_PROD=1` ile önizleme üretim derlemesiyle başlatılabiliyor (önce aynı ortam değişkenleriyle `next build`).

**Canlıya alınmadı.** Değişiklikler commit edilmedi ve yayınlanmadı. Yayından sonra kontrol: canlı sitede sayfa yanıtında `content-security-policy` başlığında `nonce-` olmalı ve tarayıcı konsolunda "Refused to" hatası görünmemeli.

## Organizatör rehberi

Canlı veritabanındaki etkinlik: **EkoZeka Hackathon** (`ekozeka-2026`). Başlangıç **6 Kasım 2026 Cuma 20:00**, son teslim **7 Kasım 2026 Cumartesi 20:00** (Türkiye saati).

### Roller

Yönetici yetkisi (`ADMIN_GITHUB_IDS`) **yalnızca bir kişide**, Furkan'ın kişisel GitHub hesabında (2FA açık). `/yonetim` sayfasındaki her işlemi o yapar: zamanlama ve süre uzatma, duyuru, "Mührü vur", iş kuyruğu, oylama, ödüller, jüri paketi, yeni etkinlik, KVKK silme. Diğer organizatörler bu sayfayı açamaz; açmaya çalışınca 404 görürler, bu normaldir.

Yönetim işleri tek kişide toplandığı için diğer organizatörler gözlem ve iletişimi üstlenir:

- **Yönetici (Furkan):** bütün `/yonetim` işlemleri. Normalde kilit 20:00'de kendiliğinden vurulur; düğmeye basılmaz. Yöneticinin bilgisayarı ve GitHub girişi etkinlik boyunca hazır olmalı; son saatte yerinden ayrılmamalı.
- **Ekip masası:** teslim sorunu yaşayan ekiplerle yüz yüze ilgilenir. Yönetim paneli gerektirmeyen her şeyi ekibin kendi panelinden çözdürür (aşağıdaki "Sorun anında" tablosu). Yönetici işlemi gerekirse yöneticiye iletir.
- **Sahne ve duyuru:** `/sahne` ekranı (yönetici gerektirmez, herkes açabilir), sözlü anonslar, Telegram grubu. Duyuru şeridine yazılacak metni yöneticiye iletir.
- **Gözlemci:** vitrini (`/`) ve sahneyi izler; kayıt sayısını, uygunsuz içeriği ve ekip büyüklüğü ihlallerini not edip yöneticiye bildirir.
- **Jüri koordinatörü:** yöneticinin indirdiği jüri paketini ve CSV'yi jüriye dağıtır, jüri kararlarını toplayıp ödül metinlerini yöneticiye verir.

**Yedek planı:** Yönetici hesabına erişim kaybolursa (cihaz, oturum, 2FA) yönetim işlemleri yapılamaz. Kilit ve mühürleme kendiliğinden işlemeye devam eder; ancak süre uzatma, oylama ve ödüller beklemek zorunda kalır. Gerekirse ikinci bir kişinin sayısal GitHub kimliği Vercel'de `ADMIN_GITHUB_IDS` değişkenine eklenip yeniden yayınlanabilir; bu birkaç dakika sürer. Vercel projesine erişimi olan kişiyi önceden belirleyin.

### Şimdi ile 1 hafta öncesi arası: kurulum

- [ ] Vercel'de `ADMIN_GITHUB_IDS` yalnızca Furkan'ın sayısal GitHub kimliğini (`https://api.github.com/users/<kullanıcı-adı>` yanıtındaki `id`) içersin; başka kimlik olmasın. Furkan `/yonetim` sayfasını açabildiğini, başka bir organizatör de açamadığını (404) kontrol etsin.
- [x] Yönetici GitHub hesabında iki adımlı doğrulama (2FA) açık.
- [ ] 9 Ekim A09/A21 düzeltmeleri canlıya yayınlandı; canlı sayfada CSP başlığında `nonce-` var ve tarayıcı konsolunda "Refused to" hatası yok. `/yonetim` üstünde oturum tazeliği satırı görünüyor.
- [ ] `GITHUB_TOKEN`'ın son kullanma tarihi 7 Kasım'dan en az iki hafta sonraya ayarlı olsun. Token süresi dolarsa teslim alınamaz.
- [ ] Supabase → Authentication → Providers: yalnızca **GitHub** açık kalsın; e-posta/şifre girişini kapatın. Danışmandaki "sızmış şifre koruması" uyarısı bu durumda önemsizleşir.
- [ ] Supabase Redirect URL'lerinde canlı adresin `/auth/callback` yolu var. GitHub OAuth App callback adresi Supabase'i gösteriyor.
- [ ] `NEXT_PUBLIC_SITE_URL` canlı adres olsun. Alan adı değişirse `0003_cron.sql` içindeki URL'yi ve Vault'taki `muhur_cron_secret` kaydını da güncelleyin.
- [ ] Telegram: bot grupta, `TELEGRAM_CHAT_ID` doğru. Deneme duyurusuyla mesajın gruba ulaştığını görün. Katılımcıları gruba önceden alın.
- [ ] `CONTACT_EMAIL` kulüp adresi olsun; `/gizlilik` metnini bir kez okuyun.
- [ ] Bir tarayıcıda giriş yapın → geliştirici araçları → Application → Cookies: `sb-…` ve `gh_token` çerezlerinde **HttpOnly** işaretli olsun (A13'ün canlı doğrulaması).
- [ ] Yedek: Supabase planınızın yedekleme kapsamını kontrol edin. Veritabanı yedekleri Storage dosyalarını (arşivleri) kapsamaz. Etkinlik sonrasında jüri paketini indirip ayrıca saklamayı plana koyun.

### Kuru prova (başlangıçtan önce, güncel etkinlik üzerinde)

Ayrı bir deneme etkinliği açmak için güncel etkinliği kalıcı olarak kilitlemek gerekiyor. Bu yüzden provayı güncel etkinlikte, **kilitlemeden** yapın ve sonunda bütün deneme kayıtlarını geri çekin.

- [ ] İki organizatör: biri deneme reposunu içe aktarsın, diğeri davet bağlantısıyla katılsın.
- [ ] Repoya yeni bir commit push edin → panelde "Teslim sürümünü güncelle" → kabul edilen SHA'nın yeni commit olduğunu görün.
- [ ] Kabul edilmiş arşivi panelden indirin; SHA-256 değeri panelde gösterilenle aynı olsun.
- [ ] `/yonetim` tablosunda kaydın görünümünü inceleyin: üyeler, son push, durum.
- [ ] `/sahne` sayfasını projektörde açın; QR kodunu birkaç telefonla okutun.
- [ ] **Yapmayın:** "Mührü vur", son teslimi geçmişe çekmek, oylamayı açmak. Mühürleme, jüri paketi ve oylama yalnızca yerel önizlemede (`npm run preview:test`) prova edilebilir.
- [ ] Prova bitince deneme kayıtlarını geri çekin.

### Etkinlikten 1 gün önce

- [ ] **"muhur test" kaydını geri çekin:** kaydın kurucusu `/panel` → Projeyi geri çek → proje adını aynen yazar. Böylece ilk gerçek ekip No. 001 alır.
- [ ] **"demo" duyurusunu kaldırın:** `/yonetim` → Duyuru alanını boşaltıp kaydedin.
- [ ] `/yonetim` → Zamanlama: 6 Kasım 20:00 / 7 Kasım 20:00.
- [ ] `/yonetim` → "Son başarılı çalışma" bir dakikadan eski olmasın.
- [ ] Katılımcılara duyurulacak kurallar metni hazır olsun:
  - Repo public olmalı, proje başına tek repo, varsayılan daldaki kod teslim edilir.
  - Arşiv en fazla 50 MB.
  - **Her push'tan sonra panelde "Teslim sürümünü güncelle"** ve kabul edildiğini gör. Kayıt olmak teslim etmek değildir.
  - Son saniyeyi bekleme: arşiv 20:00'den önce doğrulanmış olmalı.
  - Ekip büyüklüğü sınırı ve etkinlik öncesi kod yasağı (sistem uygulamaz, organizatörler denetler).
  - Kurucu değişikliği, üye çıkarma, davet yenileme yalnızca kilitten önce yapılabilir.

### Etkinlik günü

**Başlangıç (6 Kasım 20:00)**

- [ ] Yönetici 19:00 civarı `/yonetim` → "GitHub ile yeniden giriş yap". Kilit, zamanlama ve oylama 7 Kasım 07:00'ye kadar açık kalır.

- [ ] Duyuru şeridine ve Telegram'a başlangıç mesajını gönderin.
- [ ] 20:00'den önce oluşmuş kayıtları `/yonetim` tablosunda not edin (madde 3).

**Etkinlik süresince**

- [ ] `/yonetim` tablosunda "Kod teslimi bekleniyor" yazan ekipleri düzenli aralıklarla takip edin.
- [ ] "Repo başlangıçtan önce açılmış" ve "Başlangıçtan önce tarihli commit var" işaretleri kanıt değil, ipucudur; jüri notu olarak kaydedin.
- [ ] Üye sayısı sınırı aşan ekip varsa kurucusundan üye çıkarmasını isteyin. Admin üye çıkaramaz.
- [ ] Uygunsuz proje adı, özet veya logo görürseniz ekipten kilitten önce düzeltmesini isteyin. Admin bu alanları düzenleyemez ve eseri gizleyemez.
- [ ] İş kuyruğunda "Başarısız" görünen iş için "Tekrar dene". Zamanlayıcı satırı kırmızıysa "Kuyruğu şimdi işle" ve Supabase'te `cron.job_run_details` kaydına bakın.

**Son 3 saat (7 Kasım 17:00–20:00)**

- [ ] Yönetici 7 Kasım 17:00'de yeniden giriş yapsın: süre uzatma ve gerekirse erken kilit 20:00'de açık olur, oylama ve yeni etkinlik 8 Kasım 05:00'e kadar açık kalır. Yönetim sayfası süre dolmadan üç saat önce de uyarır.

Ara mühürler otomatik olarak yaklaşık 25 dakikada bir alınır. Bunlar yedektir; teslim sayılmaz.

**Son saat**

- [ ] Telegram hatırlatmaları 19:00 ve 19:45'te kendiliğinden gider ve kontrol bekleyen ekipleri listeler.
- [ ] 19:00, 19:30, 19:45 ve 19:55'te sözlü anons: "Push et, panelde teslim sürümünü güncelle, kabul edildiğini gör."
- [ ] Tabloda hâlâ kabul edilmiş sürümü olmayan ekiplerin masasına bizzat gidin.
- [ ] **Süre uzatma yalnızca 20:00'den önce mümkün:** `/yonetim` → Zamanlama'da son teslim ileri alınabilir; bu herkes için geçerli olur. Son teslim geçtikten sonra uzatılamaz. GitHub kesintisi gibi bir durumda kararı 20:00'den önce verin.

**20:00, kilit**

- [ ] Kilit kendiliğinden vurulur; "Mührü vur" düğmesine basmayın. Düğme yalnızca süreyi erken bitirmek içindir ve geri alınamaz.
- [ ] Tabloda "Arşivleniyor…" durumları birkaç dakika içinde mühüre dönmeli. `freeze_error` görünen satırda "Tekrar dene".
- [ ] "Süre dolmadan kabul edilmiş teslim sürümü yok" yazan ekip teslim etmemiş demektir. Kural gereği bu değiştirilemez; ekibe açıkça söyleyin.

### Kilitten sonra

- [ ] **Jüri paketi:** `/yonetim` → "Mühürlü teslimler ZIP" ve "CSV listesi". Jüri rolü olmadığı için, jüri üyeleri admin değilse paketi siz indirip dağıtın. Paket sınırı 500 MB; aşarsa CSV ve tekil arşivler.
- [ ] **Diskalifiye kararı oylamadan önce verilmeli.** Sistemde diskalifiye yok; mühürlü her eser oylamada aday olur. Diskalifiye edilen esere ödül vermeyin ve kararı jüri notlarına yazın.
- [ ] **Halkın seçimi:** "Oylamayı aç" → her GitHub hesabı bir oy, kendi ekibine oy yok, yalnızca mühürlü eserler. Sahte hesap koruması yok; oylamayı salonda ve kısa süreli açın. Sonuç ilanından önce şüpheli durumda Supabase'te `votes` tablosunu `auth.users.created_at` ile birlikte inceleyin (oylama gününe yakın açılmış hesaplar). "Kapat ve sonuçları açıkla" geri alınamaz.
- [ ] **Ödüller:** yalnızca mühürlü eserlere verilebilir; gerekçe 10–280 karakter. Ödül kaldırılabilir ve kayda geçer.
- [ ] **Arşivleri saklayın:** jüri paketini ve CSV'yi kulübün kendi deposuna da koyun.
- [ ] **Yeni etkinlik:** açıldığında bu etkinlik geçmiş sergilere taşınır. Acele etmeyin; açmadan önce bütün mühürlerin tamamlandığını görün.
- [ ] **KVKK başvurusu:** `/yonetim` → Kişisel veri silme (GitHub kullanıcı adı ve gerekçe).
- [ ] Etkinlikten sonra gerekmiyorsa Telegram bot token'ını ve `GITHUB_TOKEN`'ı iptal edin.

### Sorun anında

| Durum | Ne yapılır |
|---|---|
| Ekip "repom listede yok" diyor | Listenin altındaki "Listede yok mu?" kutusuna repo bağlantısını yapıştırsın. Repo public mi, başka ekip almış mı, kontrol edin. |
| "GitHub oturumunun süresi dolmuş" | Çıkış yapıp yeniden giriş. |
| "Bu repoya yazma yetkin görünmüyor" | Repo sahibi ya da push yetkisi olan ekip üyesi içe aktarsın. |
| Teslim reddedildi | Panel mesajını okuyun: 50 MB sınırı, private repo, boş dal, 10 dakikada 6 teslim kotası. Önceki kabul edilmiş sürüm korunur. |
| "Önceki sürüm hâlâ işleniyor" | İş bitince tekrar teslim etsin; panel durumu canlı günceller. |
| Zamanlayıcı durdu | `/yonetim` → "Kuyruğu şimdi işle". Supabase `cron.job` ve `cron.job_run_details`. Son teslimden sonraki ilk ana sayfa ziyareti de kilidi yazar. |
| GitHub kesintisi | Kabul edilmiş son sürümler geçerlidir. Gerekirse 20:00'den önce herkes için süre uzatın. |
| Site erişilemiyor | Son teslim ve kabul kayıtları veritabanında; kabul edilmiş teslimler kaybolmaz. Vercel durumunu kontrol edin. |
| Yanlışlıkla erken kilit | Geri alınamaz. Bu yüzden düğme tek kişide. |
| Uygunsuz içerik (kilitten önce) | Ekipten düzeltmesini isteyin. Son çare Supabase tablo düzenleyicisi: bu işlem `admin_audit` kaydına düşmez, kendiniz not alın. |

## Açık kararlar (sistemde karşılığı yok)

| Konu | Bu etkinlik için elle çözüm | Kalıcı çözüm (kod) |
|---|---|---|
| Başlangıç öncesi kayıt ve teslim | 20:00 öncesi kayıtları not edin; kuralı önceden duyurun | `register_project` / `enqueue_submission` içinde `starts_at` kontrolü |
| Ekip büyüklüğü sınırı | Tablodaki üye listesinden takip; kurucuya çıkarttırma | `events.max_team_size` + `join_project_by_code` içinde sayım |
| Eser gizleme / diskalifiye | Kilitten önce ekibe düzelttirme; kilitten sonra ödül vermeme ve jüri notu | Gerekçeli durum alanı; oylama, sayım, sahne ve paketten dışlama; `admin_audit` kaydı |
| Jüri rolü | Paketi organizatör indirir ve dağıtır | Salt okunur jüri kimlik listesi: arşiv ve CSV açık, kilit ve zamanlama kapalı |
| Oylamada sahte hesap | Salonda kısa süreli oylama; ilan öncesi hesap yaşı kontrolü | Hesap yaşı alt sınırı ya da sahnede gösterilen kısa ömürlü oy kodu |
| Deneme etkinliği | Kuru provayı güncel etkinlikte yapıp geri çekmek | Gizli / deneme etkinliği bayrağı |

## Geliştirici notları

- `npm run check` temiz kurulumda TypeScript hatası veriyor (`PageProps`, `RouteContext` bulunamadı); önce `next typegen` çalışmalı. Bu adım `check` betiğine eklenebilir.
- README'deki "0004 canlıya uygulanmış sayılmaz" notu güncel değil: 0004 ve 0005 canlıda kayıtlı.
- `.env.example` içinde `ADMIN_GITHUB_IDS` üstünde eski bir yorum satırı kalmış ("GitHub kullanıcı adları").
- `audit/reproduce-code.mjs` ve `audit/reproduce-db.mjs` düzeltme öncesi davranışı gösteriyor; arşiv değeri var ama regresyon testi değiller.
- `test:db` için PostgreSQL 17 gerekiyor; bu makinede kurulu değil. Eşzamanlılık testleri etkinlikten önce bir kez koşulmalı.
- `worker_runs` dakikada bir satır büyüyor (şu an 7014) ve temizlenmiyor; etkinlik için sorun değil.
