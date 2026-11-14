# Mühür · Çoklu topluluk platformu — tasarım

Tarih: 2026-11-09 · Durum: taslak, onay bekliyor

## Amaç ve neden

Mühür bugün DEÜ CS&AI'nın tek bir hackathonu (EkoZeka) için yazılmış bir teslim kilidi. Hedef, onaylı toplulukların kendi hackathonlarını kendi başlarına yönettiği ulusal bir platform. Başta birkaç topluluğa ücretsiz sunulacak; popülerlik kazanınca bir gelir modeline bağlanacak. Depolama maliyetini o güne kadar platform sahibi (devfurkanakblt) karşılıyor.

Ürünün varlık sebebi değişmiyor: "ne, ne zaman teslim edildi" konusunda sıfır anlaşmazlık. Çoklu topluluğa geçişin bu güvenceyi zayıflatmaması, üstüne **topluluklar arası tam ayrım** eklemesi gerekiyor.

## Hedefler

1. Topluluklar başvurur, head admin onaylar; onaylı topluluk kendi etkinliklerini onay beklemeden yayınlar.
2. Her yetki **etkinlik ya da topluluk kapsamlıdır**; bir topluluğun organizatörü başka topluluğun hiçbir verisini göremez, değiştiremez.
3. Birden çok etkinlik aynı anda yaşayabilir (aynı saatte biten iki hackathon dahil).
4. Topluluk kendi adı, logosu, etkinlik adı ve vurgu rengiyle görünür; platform markası (mühür. + DEÜ CS&AI imzası) her yerde kalır.
5. Sözleşme onayları sürümlü ve kanıtlanabilir biçimde kaydedilir.
6. Arşiv maliyeti sınırlıdır: ZIP'ler kilitten 30 gün sonra silinir.

## Hedef dışı (bu tasarımda yok)

- **Jüri puanlama / değerlendirme formu.** Ayrı tasarım olarak sonra ele alınacak. Bu tasarım jürinin yalnızca rolünü, davetini, girişini ve yarışma yasağını kapsar.
- Mühür içinde başvuru formu oluşturucu. Topluluk kendi formunun bağlantısını verir.
- Ödeme / gelir modeli, kota satışı.
- Etkinlik yayınına onay akışı (kullanıcı kararı: gerek yok).

## Anti-hedefler (çalışsa bile başarısızlık sayılır)

- Bir organizatörün, kontrolü unutulmuş tek bir uç nokta yüzünden başka topluluğun arşivini indirebilmesi ya da kilidine dokunabilmesi.
- Askıya alma ya da arşiv silme işleminin mühür kaydını (SHA, sha256, zaman) bozması veya "ne teslim edildi" kanıtını yok etmesi.
- Topluluk marka ayarlarının kilit ekranını, mühür kayıtlarını ya da "mühür." imzasını değiştirebilmesi.
- Mevcut EkoZeka verisinin, bağlantılarının ya da sergisinin kırılması.

## Kısıtlar

- Yığın aynı kalır: Next.js App Router (bu sürümde API'ler farklı; `node_modules/next/dist/docs/` okunmalı), Supabase (Postgres, Auth, Storage), Vercel.
- Sunucu bugün neredeyse her işlemi `createAdminClient()` (servis anahtarı, RLS'siz) ile yapıyor. Yetki ayrımı bu yüzden **uygulama katmanında tek merkezden** ve **kritik yazmalarda veritabanı fonksiyonlarında** ikinci kez denetlenmeli.
- Mevcut güvenceler korunur: kilit geri alınamaz, kilit sonrası yazma DB tetikleyicileriyle reddedilir, geri alınamaz yönetim işlemleri 12 saatten yeni oturum ister (`ADMIN_REAUTH_MS`), yönetim işlemleri `admin_audit` / `log_admin` ile kaydedilir.
- Kimlik yetkisi `user_metadata`'dan değil, sunucunun yönettiği identity kaydından okunur (denetim A01/A02). Bu kural LinkedIn kimliği için de geçerlidir.
- Dil Türkçe; DESIGN.md görsel kuralları (2px köşe, kart/gölge yok, indigo yalnızca süre/kilit/birincil eylem) platform yüzeylerinde geçerli.
- Kodda iş: önce `origin/main`'e bakılır; migration'lar canlı DB durumu kontrol edilmeden uygulanmaz.

## Roller (kullanıcı kararı)

| Rol | Kapsam | Yapabilir | Yapamaz |
|---|---|---|---|
| **Head admin** | Platform | Topluluk başvurusu onayla/reddet (gerekçeli), topluluğu ve etkinliği askıya al/askıyı kaldır, tüm etkinlik ve projeleri incele (arşivler dahil) | Kilit atmak, ödül vermek, etkinlik zamanlarını değiştirmek |
| **Topluluk sahibi** | Kendi topluluğu | Başvuruyu yapan ve platform sözleşmesini topluluk adına onaylayan kişi. Organizatör davet eder/çıkarır; organizatörün her şeyini yapar | Başka topluluk |
| **Organizatör** | Kendi topluluğunun etkinlikleri | Etkinlik oluştur, zamanlar, duyuru, kilit, ödüller, arşiv/jüri paketi indirme, jüri daveti, marka ayarları | Başka topluluk; askıdaki etkinlikte yönetim işlemi |
| **Jüri** | Tek etkinlik | O etkinliğe özel davetle gelir; GitHub **veya LinkedIn** ile girer. (Puanlama sonraki tasarımda.) | **O etkinlikte yarışmak**: proje oluşturamaz, ekibe katılamaz (DB düzeyinde) |
| **Katılımcı** | Etkinlik | Bugünkü akış: GitHub ile proje kaydı, ekip daveti, teslim | — |

- Head admin bootstrapı: `ADMIN_GITHUB_IDS` ortam değişkeni yalnızca ilk head admin'i tanımlamak için yedek olarak kalır; asıl kaynak veritabanındaki rol kaydıdır. devfurkanakblt head admin olur.
- Jüri yasağı yalnızca jüri olduğu etkinlik için geçerli; başka etkinlikte aynı kişi yarışabilir (önerildi, itiraz edilmedi).
- Bir kişi aynı etkinlikte zaten bir projenin üyesiyse jüri daveti kabul edilemez (yasağın simetriği).
- **Topluluk sahibi ve organizatörler de kendi topluluklarının etkinliklerinde yarışamaz** (kullanıcı kararı). Yasak jüri yasağıyla aynı yerde, DB düzeyinde uygulanır. Bir etkinlikte projesi olan kişi o topluluğa organizatör olarak katılmak isterse, daveti ancak o etkinlik kilitlendikten sonra kabul edebilir (benim kararım).

## Akışlar

### Topluluk yolculuğu (kullanıcının tarif ettiği 4 ekran, onaylandı)

1. **Topluluk kaydı** — GitHub ile giriş yapılmış kişi formu doldurur: topluluk adı, üniversite/kurum, sosyal/web bağlantısı; sorumlu kişinin adı soyadı, e-posta, telefon. "Platform Kullanım Sözleşmesi'ni topluluk adına kabul ediyorum" onayı bu adımda alınır. Gönderim → başvuru `beklemede`.
2. **Onay bekleme** — "İnceleniyor" durumu, gönderim zamanı, gönderilen bilgiler (salt okunur). Sonuç e-postayla bildirilir. Ret durumunda gerekçe görünür ve yeniden başvurulabilir.
3. **Giriş** — Ayrı şifre yok; GitHub ile giriş. Onaylı topluluğun üyesi doğrudan topluluk panosuna gider.
4. **Etkinlik oluşturma** — Etkinlik adı, adres (`/e/<slug>`), başlangıç, son teslim, topluluğun kendi başvuru formu bağlantısı, kurallar/aydınlatma metni bağlantısı. "Etkinliği yayınla" ile onaysız yayına girer.

Başvuru durumları: `beklemede → onaylandi | reddedildi`, onaylı topluluk `askida` olabilir. Reddedilen kişi yeni başvuru açabilir.

### Organizatör daveti

Sahip, tek kullanımlık ve süreli bir davet bağlantısı üretir (mevcut ekip davet mekanizmasına benzer). Bağlantıyı açan kişi GitHub ile girip daveti kabul eder. Sahip organizatörü istediği an çıkarabilir. Organizatörler başka organizatör davet edemez (benim önerim; sahip tek davet kaynağı).

### Jüri daveti

Organizatör etkinlik için jüri davet bağlantısı üretir. Jüri GitHub ya da LinkedIn ile girer ve daveti kabul eder. LinkedIn ile giren hesap Mühür'de yalnızca jüri olabilir (proje sahiplenme GitHub kimliği gerektirmeye devam eder).

### Head admin ekranı

- Bekleyen başvurular listesi; her biri için **Onayla** / **Reddet (gerekçe zorunlu)**.
- Tüm topluluklar ve etkinlikler; her etkinlikte projeleri inceleme (arşiv indirme dahil) ve **Askıya al / Askıyı kaldır (gerekçe zorunlu)**.
- Bu ekranda yapılan her işlem `admin_audit`'e yazılır. Head admin'in başka topluluğun etkinliğindeki arşiv indirmeleri de kaydedilir.

## Askıya alma (kullanıcı kararı + onaylanan tahminler)

Askıdaki etkinlikte:
- **Katılımcılar** yalnızca görüntüler. Yeni kayıt, teslim gönderimi, proje düzenleme, ekibe katılma/ayrılma DB tetikleyicisi düzeyinde reddedilir (kilit kontrolüyle aynı yerde).
- Bekleyen teslim kuyruğu işleri yeni kod kabul etmez.
- **Son teslim saati işlemeye devam eder.** Askıdayken süre dolarsa kilit normal atılır ve o ana kadar kabul edilmiş son sürümler mühürlenir. Askı "ne teslim edildi" güvencesini bozmaz.
- **Organizatörler** de yönetim işlemi yapamaz (kilit, ödül, zaman, duyuru); yalnızca görüntüler.
- Herkese açık sayfada "Bu etkinlik platform tarafından geçici olarak durduruldu" uyarısı. Gerekçeyi yalnızca organizatörler görür.
- Askıyı yalnızca head admin kaldırır. Askıya alma ve kaldırma gerekçeleriyle denetim kaydına yazılır.
- Askıdaki etkinlik ana sayfa listesinde görünmez.
- Topluluğun askıya alınması: topluluğun yeni etkinlik oluşturmasını ve tüm etkinliklerinde yönetim işlemlerini durdurur. Etkinliklerin katılımcı tarafını ayrıca durdurmak için etkinlik ayrıca askıya alınır. (Benim kararım: iki ayrı düğme, çünkü yarışmacıları cezalandırmadan bir topluluğun yönetimini durdurmak gerekebilir.)

## Arşiv saklama (kullanıcı kararı: 30 gün)

- Süre etkinliğin **kilitlendiği andan** başlar (benim kararım, onaylandı).
- 30 gün sonra proje ZIP'leri ve ara mühür dosyaları depodan silinir. Mühür kaydı (accepted/frozen SHA, `archive_sha256`, boyut, zamanlar) silinmez; arşivin silindiği zaman kayda işlenir.
- Silme mevcut `lib/storage-sweep.ts` güvencelerini izler: okuma hatasında hiçbir şey silinmez, silinenler denetim kaydına yazılır.
- Silinmiş arşiv için indirme uç noktaları "saklama süresi doldu" der; jüri paketi ve doğrulama sayfası bunu açıkça gösterir.
- Mevcut EkoZeka etkinliği için de kural geçerli (kilit 8 Kasım 2026 → arşivler ~8 Aralık 2026'da silinir). Gerekirse önceden yerel yedek alınır.

## Ana sayfa ve marka (onaylandı)

- **Ana sayfa (`/`)**: "Süre dolar, mühür vurulur." başlığı; **Aktif etkinlikler** listesi (logo, etkinlik adı, topluluk · şehir, geri sayım ya da "Yakında"); **Geçmiş etkinlikler · sergiler**; üstte **Topluluğunu kaydet** düğmesi. Yalnızca yayındaki ve askıda olmayan etkinlikler listelenir.
- **Platform imzası**: Alt bilgide her sayfada "mühür · DEÜ CS&AI topluluğu tarafından geliştirildi · Kullanım Sözleşmesi · Gizlilik".
- **Etkinlik sayfası**: Üstte topluluğun adı ve logosu, köşede "mühür. ile"; etkinlik adı ve vurgu rengi topluluğun.
- **Topluluk ayarları**: topluluk adı ve logosu; etkinlik başına ad ve vurgu rengi. Vurgu rengi sunucuda kontrast kontrolünden geçer (okunamayacak renk reddedilir); koyu tema tonu otomatik üretilir.
- **Değiştirilemeyenler**: kilit ekranı ve camı, mühür kayıtları, "mühür." imzası, platform alt bilgisi.
- **Maskot ve maskot isimlendirmesi** DEÜ CS&AI'ya ait kalır; diğer toplulukların sayfalarında görünmez. Maskot isimlendirme etkinliğe bağlı isteğe bağlı özellik olur.

## Adresler

- Etkinlik yüzeyleri etkinliğe göre: `/e/<slug>` (vitrin + geri sayım), `/e/<slug>/panel`, `/e/<slug>/sahne`, `/e/<slug>/yonetim`.
- `events.is_current` kaldırılır; "güncel etkinlik" varsayan her okuma (`getEvent()`) etkinlik parametresi alacak şekilde değişir.
- Eski adresler kırılmaz: `/panel`, `/sahne`, `/yonetim`, `/sergi/<slug>/...` ve davet bağlantıları çalışmaya devam eder (yönlendirme ya da aynı sayfa).
- Topluluk panosu ve platform yönetimi için yeni yüzeyler (adlar inşacıya bırakıldı).

## Sözleşme ve onay kayıtları

- Belgeler: **Platform Kullanım Sözleşmesi** (topluluk ↔ platform; karşı taraf ve sorumlu: topluluk adına başvuran kişi), **Veri işleme eki** (Mühür veri işleyen, topluluk veri sorumlusu; saklama 30 gün kuralı), **Katılımcı kullanım koşulları** (Mühür). Etkinliğin kendi kuralları ve aydınlatma metni topluluğun bağlantısıdır.
- Her onay sürümlü kaydedilir: kim, ne zaman, hangi belge, hangi sürüm (metin özeti/hash). Belge sürümü değişince ilgili kişiden bir sonraki girişte yeniden onay istenir; onaylamadan yönetim işlemi yapamaz.
- Katılımcı, etkinliğe ilk kaydında Mühür koşullarını ve etkinliğin kural bağlantısını ayrı ayrı onaylar.
- Belge metinleri bu tasarımın konusu değil; yer tutucu metinle başlanır, yayına almadan önce hukukçu incelemesi gerekir.

## Bildirimler

- Başvuru sonucu (onay / ret + gerekçe) ve organizatör/jüri davetleri e-postayla gider. Bugün e-posta altyapısı yok; bir e-posta sağlayıcısı eklenmesi gerekir.
- Mevcut Telegram bildirimi tek kanala bağlı. Head admin'e "yeni başvuru" bildirimi bu kanaldan gidebilir. Etkinlik başına Telegram ayarı bu tasarımda yok.

## Mevcut verinin taşınması

- "DEÜ CS&AI" topluluğu onaylı olarak oluşturulur; sahibi devfurkanakblt.
- EkoZeka ve varsa diğer mevcut etkinlikler bu topluluğa bağlanır. Mevcut projeler, ödüller, mühür kayıtları ve sergi bağlantıları aynen kalır.
- `ADMIN_GITHUB_IDS` içindeki hesap(lar) head admin rolüne aktarılır.

## Uygulama sırası (kullanıcıyla kararlaştırıldı)

1. Veri modeli ve roller (topluluk, üyelik, etkinlik rolleri, askı alanları, onay kayıtları; taşıma).
2. Yetki ayrımı ve testleri (tek merkezden `requireEventRole` / `requireCommunityRole`; kritik DB fonksiyonlarında kapsam kontrolü; topluluklar arası birbirini dışlama testleri). **1 ve 2 bitmeden yeni topluluğa açılmaz.**
3. Etkinliğe göre adresler ve ana sayfa.
4. Başvuru / onay akışı, organizatör ve jüri davetleri, LinkedIn girişi, e-posta.
5. Sözleşme onay kayıtları.
6. Marka ayrımı (topluluk logosu/rengi, platform alt bilgisi, maskotun DEÜ CS&AI'ya bağlanması) ve 30 günlük arşiv saklama.

## Okuyucu kontrolünden sonra verilen kararlar (benim kararlarım, işaretli)

- **Telegram:** Mevcut tek kanal (hatırlatma, teslim/kilit, kazanan kartları, sağlık) yalnızca DEÜ CS&AI etkinlikleri için gönderir. Diğer toplulukların etkinliklerinde Telegram yok. Her `notify` çağrısı etkinliğin topluluğunu kontrol eder. Head admin'e "yeni başvuru" bildirimi bu kanaldan gider.
- **Anonimleştirme** (`anonymize_user`): Platform genelinde çalıştığı için yalnızca head admin yapar. Topluluk, veri sorumlusu olarak talebi platforma iletir.
- **Askıda kuyruk:** Askıdan önce kuyruğa girmiş teslimler işlenip kabul edilir (gönderim askıdan önce yapılmıştır). Askıdan sonra yeni kuyruk girişi reddedilir. Askı kalkınca normal kurallar geçerli olur: kilitlenmemiş etkinlikte organizatör son teslimi uzatabilir.
- **Jüri bu aşamada:** Kilitten sonra kendi etkinliğinin jüri paketini ve arşivlerini indirebilir (bugün yöneticilerin yaptığı gibi). Paket 30 günlük saklama dolduysa "süre doldu" der. Puanlama sonraki tasarımda.
- **Üyelik ve sahiplik:** Bir kişi birden çok topluluğun organizatörü olabilir. Sahip, sahipliği bir organizatöre devredebilir. Sahip hesabını kaybederse head admin topluluğun sahibini yeniden atayabilir; bu bir topluluk işlemidir, etkinlik yönetimi sayılmaz, denetim kaydına yazılır.
- **Head admin kaynağı:** `ADMIN_GITHUB_IDS` yalnızca taşıma (seed) sırasında okunur. Sonrasında tek kaynak veritabanıdır; ortam değişkeni değişikliği yetki vermez. Uygulamada başka head admin atama ekranı yok.
- **Diğer özellikler:** Halk oylaması, gizem avı ve easter egg'ler etkinlik başına açılıp kapanan özelliklerdir. Yeni topluluklarda varsayılan kapalı, DEÜ CS&AI etkinliklerinde mevcut hâliyle açık. Halk oylamasında oy, GitHub ile giriş yapmış herkesindir; jüri kendi etkinliğinde oy veremez. Teslim yeniden deneme ve işçi tetikleme, kendi etkinliğinde organizatöre ve head admin'e açıktır (kilit ya da ödül sayılmaz).
- **Katılımcı koşullarının yeni sürümü** teslimi engellemez. Yeni sürüm bir sonraki etkinlik kaydında onaylatılır. Organizatör ve sahip için ise yeniden onay olmadan yönetim işlemi yapılamaz.

## İnşacıya bırakılanlar

- Tablo, sütun ve fonksiyon adları; RLS'nin hangi tablolarda ek savunma olarak açılacağı.
- Yeni sayfaların URL adları (topluluk panosu, platform yönetimi, başvuru).
- Davet bağlantılarının geçerlilik süresi.
- E-posta sağlayıcısı seçimi (Vercel Marketplace üzerinden).
- Vurgu rengi kontrast eşiği ve koyu ton üretimi.
- Ekranların görsel ayrıntısı (DESIGN.md içinde kalarak).

## 13 Kasım 2026 · Ayrıntılı plan bağlantıları

Bu bölüm tarihli tasarımın sonraki planlama kaydıdır; yukarıdaki eski başlık, uygulanma durumu veya teknik öneriler topluca onaylanmış sayılmaz. Kullanıcının yeni açık tercihi: **işlemsel e-posta sağlayıcısı Brevo**. E-posta sağlayıcısı seçimi artık inşacıya bırakılmış bir karar değildir.

- [Plan 3: başvuru, davetler, LinkedIn ve Brevo](../plans/2026-11-13-coklu-topluluk-3-basvuru-davet-ve-brevo.md)
- [Plan 4: sözleşme sürümleri ve yeniden onay](../plans/2026-11-13-coklu-topluluk-4-sozlesme-surumleri-ve-onay.md)
- [Plan 5: marka, özellikler ve 30 günlük saklama](../plans/2026-11-13-coklu-topluluk-5-marka-ozellikler-ve-saklama.md)
- [Ortak uygulama sırası, bağımlılıklar ve migration haritası](../plans/2026-11-13-coklu-topluluk-3-5-uygulama-sirasi.md)

Ortak sözleşme kayıt temeli başvuru sırasında gerekli olduğundan Plan 3'te kurulur; sürüm yenileme ve bütün yönetim yollarındaki zorunlu denetim Plan 4'te tamamlanır. Genel topluluk açılışı üç planın yayın girdileri de tamamlanana kadar kapalıdır. Dosyalar ayrıntılı uygulama önerileridir; bu turda uygulama kodu veya canlı sistem değiştirilmedi.


## 13 Kasım 2026 · Plan 3 uygulama kaydı

Plan 3 `feat/topluluk-basvuru` dalında `cbde216` ile yerelde uygulandı: başvuru/onay, davet ve sahiplik, LinkedIn jüri, Brevo outbox/işçi/webhook, ortak belge/onay temeli ve etkinlik belge bağlantıları. 101 test, üretim derlemesi, gerçek PostgreSQL ve tarayıcı kontrolleri geçti. Genel başvurular Plan 4–5 tamamlanana kadar kapalı. Plan 4–5 ve canlı Brevo/LinkedIn provası henüz tamamlanmış sayılmaz; ayrıntılar Plan 3'ün uygulama kaydında.
