# mühür. · DEÜ CS&AI

> Süre dolar, mühür vurulur.

Hackathon ekipleri public GitHub repolarını içe aktarır. İlk kod arşivi kayıt sırasında kuyruğa alınır. **Her yeni push'tan sonra ekip panelinden “Teslim sürümünü güncelle” seçilir.** Yalnızca son teslimden önce sunucuda arşivlenip bütünlüğü doğrulanan son sürüm kabul edilir. Süre dolunca bu değiştirilemez kopya mühürlenir (commit SHA + ZIP + SHA-256). Kayıt oluşturmak ve kod tesliminin kabul edilmesi farklı durumlardır.

## Sayfalar

| Adres | Ne var |
|---|---|
| `/` | Güncel etkinlik: saate göre değişen selam ve maskot, geri sayım (başlamadan önce başlangıca), vitrin; sonuçlar açıklanınca vitrinin başında kazananlar (jüri ödülleri ve halkın seçimi) |
| `/maskot` | Maskota isim önerme, halk oylaması ve canlı sonuçlar; organizatör aşama ve öneri görünürlüğü kontrolü |
| `/panel` | Ekip paneli: kayıt, teslim sürümü güncelleme, hazırlık listesi, zaman çizelgesi, demo, davet, kuruculuk devri, silme onayı, rozet ve makbuz |
| `/sergi/<etkinlik>/<no>` | Eser sayfası (paylaşım kartı ile), oy düğmesi, mühür kaydı |
| `/sergi/<etkinlik>/<no>/makbuz` | Yazdırılabilir mühür makbuzu (kilitten sonra) |
| `/sergi/<etkinlik>` · `/sergiler` | Geçmiş sergiler |
| `/dogrula` | Mühürlü ZIP'in SHA-256'sı (tarayıcıda hesaplanır) ya da commit koduyla doğrulama |
| `/sahne` | Projektör için tam ekran sahne modu; kilitten sonra açıklanan her ödül birkaç saniye içinde tören gösterisiyle (logo, eser, ekip, üyeler) açılır |
| `/yonetim` | Admin: zamanlama, duyuru, kilit, oylama, yeni etkinlik, iş kuyruğu, cron takibi, toplu jüri paketi, CSV, jüri ödülleri |
| `/gizlilik` | KVKK aydınlatma metni |
| `/api/rozet/<etkinlik>/<no>` | README rozeti (SVG) |
| `/api/juri/<etkinlik>` | Admin için toplu ZIP; `?format=csv` ile teslim listesi |
| `/api/qr` | Sahne için site QR kodu (SVG) |
| `/api/kazanan/[id]` | Telegram duyurusundaki kazanan kartı (1200×630 PNG): jüri ödülü kimliği ya da `halk-<proje>` |
| `/api/durum` | Oturuma göre değişim sürümü; canlı durum ve sunucu saati |

## Kilit nasıl çalışır

1. **Teslim isteği:** repo kimliğinden güncel varsayılan dal ve commit seçilir; SHA kalıcı teslim işine yazılır. Sonraki denemeler başka commit seçmez.
2. **Arşiv ve kabul:** ZIP 50 MB sınırıyla indirilir, değiştirilemez bir yola yazılır ve depodan tekrar okunup SHA-256 ile doğrulanır. Veritabanı `clock_timestamp()` kullanarak bu anda teslimin hâlâ açık olduğunu denetler. İşe sahip olan geçerli lease tokeni dışında kimse kabulü tamamlayamaz.
3. **Kilit:** son tarih veya erken kilit geri alınamaz. Başarısız/geç güncelleme, daha önce kabul edilmiş teslimi değiştirmez. Süre dolduktan sonra yeni kod kabul edilmez.
4. **Mühür:** kabul edilmiş arşiv yeniden doğrulanır ve aynı SHA/yol/hash mühür alanlarına kaydedilir. Bu aşamada GitHub'a ihtiyaç yoktur; repo silinse, private olsa veya force-push yapılsa da kabul edilmiş kopya korunur. Kabul edilmiş sürüm yoksa açık hata gösterilir; güncel HEAD yanlışlıkla teslim sayılmaz.
5. **Kalıcı kuyruk:** `FOR UPDATE SKIP LOCKED`, 3 dakikalık lease ve en fazla 5 deneme. Geçici hatalar (GitHub 502, depo 503) önce aynı lease içinde 1 ve 2 sn sonra yeniden denenir, sonra gecikmeli denenir; son 15 dakikada teslim işi en fazla 10 sn, mühür işi en fazla 60 sn bekler. Sırada bekleyen eski sürüm, ekibin istediği daha yeni sürüme yerini bırakır (yeni sürüm yeni iş olarak açılır); aynı sürümü yeniden istemek beklemeyi atlar. Panelde düğme yalnızca iş gerçekten işlenirken kilitlidir. Eski çalışanların tamamlaması reddedilir. Yeni etkinlik açılsa da eski etkinliklerin işleri işlenir. Admin işin durumunu, hatasını ve cron geçmişini görür, yeniden deneyebilir.
6. **Ara mühürler:** son 3 saatte yaklaşık 25 dakikada bir, eser başına son 2 kopya. Bunlar inceleme/yedek içindir; kabul edilmiş teslimin yerini otomatik almaz.
7. **Sağlık ve hatırlatma:** repo erişimi, boş dal ve tahmini boyut kontrol edilir. GitHub repo boyutu ZIP boyutu değildir; gerçek sınır indirme sırasında uygulanır. Panel son saatte uyarır; Telegram ayarlıysa 60 ve 15 dakika pencerelerinde kontrol bekleyen ekipleri hatırlatır.
8. **Tetikleyiciler:** Supabase `pg_cron` dakikalık ana işleyicidir; Vercel günlük yedektir. İlk ana sayfa ziyareti ve admin düğmesi de mühür işlerini başlatır. Kilitten sonra mühür kuyruğu tek turda (40 sn bütçeyle) boşaltılır. Sayaç cihaz duvar saatinden bağımsız ilerler; açık sayfalar durum değişimini çeker, kaydedilmemiş formlar korunur.

## Kurulum

Canlı adres: **https://muhur-phi.vercel.app** (Vercel projesi `muhur`, bölge `fra1`). Yeniden yayınlamak için `npx vercel deploy --prod`.

Supabase projesi: `proje-kilidi` (eu-central-1, ref `kgxwyopbmhtveyyhyfhg`). Yeni teslim akışı için **`supabase/migrations/0004_delivery.sql` canlı veritabanına uygulanmalıdır**. Yerel testte migration doğrulandı; bu çalışma sırasında canlı bağlantı doğrulanamadığından canlıya uygulanmış sayılmaz.

Mevcut kurulumda yalnızca `0004_delivery.sql` çalıştırılır. `0002_events.sql` tabloları yeniden oluşturduğu için dolu veritabanında tekrar çalıştırılmaz. Açık etkinlikteki mevcut ekipler ilk kez teslim sürümünü kaydetmelidir; eski tamamlanmış mühürler değiştirilmez. Migration uygulandıktan sonra `npm run check:schema`, ardından yeni uygulama sürümü yayınlanır. Eski sürümün GitHub Events tabanlı cron işleyicisiyle yeni akış aynı anda çalıştırılmamalıdır; geçişi etkinlik dışında yap.

`supabase/migrations/0005_hardening.sql` (denetim düzeltmeleri) 0004'ten sonra uygulanır ve geriye uyumludur: önce migration, sonra `npm run check:schema`, ardından uygulama yayını. Eklenenler: aktörlü ekip RPC'leri (`update_project`, `withdraw_project`, `join_project_by_code`, `remove_member`, `renew_invite`, `leave_project`); idempotent ve kotalı `enqueue_submission` (aynı commit yeniden arşivlenmez, proje başına 10 dakikada 6 teslim, yanıtta istenen/sıradaki/kabul edilen SHA); eski kabul arşivlerinden en yeni üçü tutulur (kayıtlar silinmez, mühür ve güncel kabul budanmaz); oy yazımı etkinlik satırını kilitler, aday yalnızca mühürlü eserdir, toplamlar `vote_tallies` ile DB'de sayılır; kilitli etkinliğin bekleyen teslim işleri kuyruktan alınmadan kapanır, mühür işleri önce işlenir; ekleme-only `admin_audit` kaydı ve `anonymize_user`.

`supabase/migrations/0006_son_dakika.sql` (son dakika teslimleri) 0005'ten sonra uygulanır ve geriye uyumludur: önce migration, sonra `npm run check:schema`, ardından uygulama yayını. `enqueue_submission` bekleyen eski sürümü yeni sürümle değiştirir ve aynı sürümün yeniden isteğinde beklemeyi atlar; `fail_delivery_job` son 15 dakikada geri çekilmeyi kısaltır; `delivery_schema_version()` şema kontrolü içindir.

`supabase/migrations/0007_gizem.sql` (gizem avcısı) 0006'dan sonra uygulanır ve geriye uyumludur: önce migration, sonra `npm run check:schema`, ardından uygulama yayını. `mystery_hunters` tablosu ve `claim_mystery` yalnızca sunucuya açıktır; kayıt yalnızca hackathon saatlerinde (başlangıçtan mühüre) yapılır. `anonymize_user` gizem kaydındaki adı da anonimleştirir.
`supabase/migrations/0009_mascot_naming.sql` uygulama yayını öncesinde çalıştırılır. `/maskot` her güncel etkinlik için ayrı bir tur açar: kayıtlı yarışmacılar kişi başına bir isim önerir, organizatör önerileri gözden geçirip oylamayı başlatır, GitHub ile giriş yapan ziyaretçiler kişi başına bir oy verir. Kendi önerine oy verilemez. Liste ve oy toplamları yaklaşık 5 saniyede bir yenilenir; organizatör sonucu kapatıp açıklar. Aşama geçişi, tek öneri/oy ve kendi önerine oy engeli veritabanında da uygulanır.
`supabase/migrations/0010_mascot_name_edit.sql` 0009'dan sonra, uygulama yayını öncesinde çalıştırılır ve geriye uyumludur. Yarışmacı kendi önerisini öneri aşaması boyunca düzenleyebilir; oylama açılınca isimler kilitlenir, yayından kaldırılan öneri düzenlenemez.

### 1. GitHub OAuth App
GitHub → Settings → Developer settings → **OAuth Apps** (GitHub Apps değil) → New OAuth App:
- Homepage URL: sitenin adresi
- Authorization callback URL: `https://kgxwyopbmhtveyyhyfhg.supabase.co/auth/v1/callback`
- Logo: `public/brand/muhur-logo-512.png`

### 2. Supabase Auth
- Authentication → Sign In / Providers → **GitHub**: Client ID ve Client Secret'ı gir, etkinleştir.
- Authentication → URL Configuration: Site URL'yi gir; Redirect URLs'e `http://localhost:3000/auth/callback` ve `https://<site>/auth/callback` ekle.

### 3. Ortam değişkenleri
`.env.example` → `.env.local` (Vercel'de Project Settings → Environment Variables):

| Değişken | Nereden |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → secret / `service_role` |
| `GITHUB_TOKEN` | GitHub fine-grained token, *Public repositories (read-only)*, izin seçmeden; son kullanma tarihi etkinlikten sonra olmalı |
| `CRON_SECRET` | Rastgele uzun bir dize |
| `ADMIN_GITHUB_IDS` | Yöneticilerin **sabit sayısal** GitHub kimlikleri, virgülle. `https://api.github.com/users/<kullanıcı-adı>` yanıtındaki `id`. Kullanıcı adı yetki vermez (değiştirilebilir). |
| `NEXT_PUBLIC_SITE_URL` | Sitenin tam adresi |
| `TELEGRAM_BOT_TOKEN` | İsteğe bağlı. Telegram'da @BotFather → `/newbot` |
| `TELEGRAM_CHAT_ID` | İsteğe bağlı. Botu gruba ekle, gruba bir mesaj yaz, `https://api.telegram.org/bot<TOKEN>/getUpdates` yanıtındaki `chat.id` (gruplarda eksiyle başlar) |
| `CONTACT_EMAIL` | KVKK metnindeki kulüp e-postası |

Telegram bildirimleri: yeni eser, duyuru, teslim kilidi, oylama açıldı, son saat hatırlatmaları ve kazananlar. Jüri ödülü yönetimden eklendiği anda kanala kupa stikırı ve kazanan kartıyla (eser, ekip, üyeler, gerekçe) duyurulur; oylama sonuçlanınca halkın seçimi adıyla duyurulur. Telegram kartı alamazsa aynı duyuru düz metin olarak gider. Hatırlatmalar etkinlik/pencere bazında kaydedilir; başarısız gönderimler yeniden denenebilir.

### 4. Dakikalık zamanlayıcı
Kurulu: Supabase `pg_cron` her dakika `https://muhur-phi.vercel.app/api/cron/tick` adresini çağırır (`supabase/migrations/0003_cron.sql`). Anahtar Supabase Vault'ta `muhur_cron_secret` adıyla durur ve Vercel'deki `CRON_SECRET` ile aynıdır. Alan adı değişirse migration'daki URL'yi güncelleyip yeniden çalıştır; `CRON_SECRET` değişirse Vault'taki kaydı da güncelle.

### 5. Etkinliği ayarla
`/yonetim` → **Zamanlama**: gerçek başlangıç ve son teslim saatini gir (Türkiye saati).

### 6. Çalıştır
```bash
npm install
npm run dev
```

## Sınırlar
- Teslim arşivi başına 50 MB. Arşiv doğrulanmadan teslim kabul edilmez. Büyük arşivde ekip dosyaları küçültüp süre dolmadan yeni sürüm teslim etmelidir.
- Arşivlemenin yalnızca başlaması yeterli değildir; kabulün süre dolmadan tamamlanması gerekir. Son saniyeyi bekleme.
- Toplu jüri ZIP'i 500 MB ile sınırlı; daha büyük etkinliklerde CSV ve tekil arşivler indirilir. Eksik arşiv varsa eksiksiz ZIP verilmez, CSV sorunlu kayıtları da içerir.
- QR kod kısa site adresleri içindir (106 UTF-8 bayt). Demo bağlantıları kod arşivinin parçası değildir; sonradan değişebilir.
- "Başlangıçtan önce tarihli commit" işareti commit tarihine dayanır; commit tarihleri değiştirilebildiği için kanıt değil, jüri için ipucudur.

## Kontroller

`npm run check`: uygulama testleri, ESLint ve TypeScript. ZIP çıktısı Python `zipfile`, QR ise Python/OpenCV ile bağımsız doğrulanır; bu kontroller için Python ve OpenCV gerekir.

`npm run test:db`: ayrı `.test-db` klasöründe PostgreSQL başlatır; 0001/0002/0004/0005/0006/0007/0008/0009/0010 migration'larını boş test veritabanında uygular; `tests/database-hardening.sql`, `tests/database-last-minute.sql`, `tests/database-mystery.sql`, `tests/database-activity.sql`, `tests/database-mascot.sql` ve davet yenileme, kurucu devri ve oylama kapanışı için gerçek iki bağlantılı yarış testleri de çalışır. Atomik kayıt, geç teslim, iş sahipliği, eski token reddi, kalıcı mühür ve eşzamanlı kayıt/worker senaryolarını sınar. PostgreSQL 17 kurulu olmalı veya `POSTGRES_BIN` ayarlanmalıdır. Canlı veritabanına bağlanmaz; 0003 yalnızca Supabase cron/Vault kurulumu içindir.

`npm run preview:test`: 3100/54330 portlarında yalnızca örnek verilerle ayrı Next dev önizlemesi. `npm run test:browser`: Chrome/Edge ile masaüstü ve mobil render kontrolleri, `test-artifacts/` içinde ekran görüntüleri. Test önizlemesinde gerçek GitHub/Supabase anahtarları ve Telegram kullanılmaz.

`npm run test:stress -- --teams 50 --storm 120`: son dakika stres testi. Yerel PostgreSQL'de gerçek migration'lar ve uygulamanın arşiv doğrulama kodu ile ekipler son saniyelerde teslim sürümünü günceller; GitHub ve depo gecikme/hata enjekte edilen sahte servislerdir (`--faults` çarpanı). Süre dolar, mühür vurulur; ardından süre sonrası kabul, mühür hash'i, çift işleme, bozuk/kayıp arşiv ve her ekibin son istediği sürümün mühürlenip mühürlenmediği bağımsız doğrulanır. Rapor `test-artifacts/stress/` altına yazılır. `psql` gerektirmez; `POSTGRES_BIN` ile PostgreSQL ikili dosyaları gösterilebilir.

`npm run test:routes`: önizleme açıkken kayıt/kabul/mühür/hata ekranları, yönetim yetkisi ve CSV indirmeyi HTTP üzerinden kontrol eder. Chrome kontrolü işletim sistemi sandbox/GPU kısıtları olan ortamlarda çalışmayabilir; HTTP kontrolü görsel doğrulamanın yerine geçtiği iddia edilmez.
