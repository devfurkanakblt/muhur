# Çoklu topluluk · Plan 5: Marka, özellikler ve 30 günlük arşiv saklama

Tarih: 13 Kasım 2026 · Durum: uygulanacak plan; kodlanmadı.

**Amaç:** her topluluğun kendi adı/logosu ve etkinlik rengiyle görünmesi; Mühür imzasının korunması; DEÜ maskotunun diğer topluluklara taşmaması; etkinlik bazlı isteğe bağlı özellikler; kilitten 30 gün sonra ZIP dosyalarının kanıt kayıtları korunarak güvenilir biçimde silinmesi.

**Bağımlılık:** Plan 2 etkinlik adresleri, Plan 3 topluluk yönetimi, Plan 4 onay/etkinlik kural akışı. Önerilen migration'lar `0019_marka_ve_ozellikler.sql`, `0020_arsiv_saklama_temeli.sql`, `0021_arsiv_saklama_aktivasyonu.sql`. Numaralar uygulama öncesinde gerçek geçmişe göre doğrulanır; eski migration'lar düzenlenmez.

## Değişmeyecek ürün kuralları

- Kilit geri alınamaz; renk/logo/özellik ayarı kabul edilen SHA, hash, arşiv yolu veya zamanı değiştirmez.
- Etkinlik rengi etkinlik alanıyla sınırlıdır; root `--indigo` değişkeni yeniden atanarak platform/diğer etkinlikler etkilenmez. Mühür/kilit çizgileri ve platform imzası mevcut kimliğini korur.
- Platform alt bilgisi her sayfada `mühür · DEÜ CS&AI topluluğu tarafından geliştirildi · Kullanım Sözleşmesi · Gizlilik` biçiminde kalır; belge bağlantıları Plan 4'ün yayınlanmış adreslerine gider.
- Maskot ve maskot isimlendirmesi DEÜ CS&AI'ya aittir. Platformun kendi sayfalarında kullanılabilir; başka topluluğun etkinlik, eser, belge, sahne, makbuz ve paylaşım kartında görünmez.
- Halk oylaması, gizem avı, klavye/easter egg ve maskot isimlendirme etkinlik ayarıdır. Diğer topluluklarda varsayılan kapalı, mevcut DEÜ etkinliklerinde geçmiş davranış korunur. Maskot ismi başka toplulukta bayrak verilse bile açılamaz.
- Telegram mevcut topluluk iznine bağlı kalır. Bu plan diğer topluluklara yeni Telegram kanalı veya müşteri bot ayarı eklemez.
- ZIP saklama süresi **kalıcı `events.locked_at` anından 30 gün**; dosyalar silinse de proje, submission, snapshot, SHA/hash/boyut/zaman ve audit kanıtları kalır. Sözleşme onay kayıtları bu temizliğin hedefi değildir.

## Task 1 — Marka şeması ve güvenli ayarlar

**Ekle:** `0019`, `lib/branding.ts`, `lib/event-features.ts`, `tests/branding.test.mjs`, `tests/database-branding.sql`. **Değiştir:** `lib/data.ts`, `lib/env.ts` gerekiyorsa, DB/stres migration listeleri.

Şema:
- `communities.logo_path text`, `branding_updated_at`; mevcut `name`, `university`, `city`, `link` alanları kullanılır. Başvuru iletişim/sahip/status alanları genel marka formundan değiştirilemez.
- `events.accent_color text` (normalize `#RRGGBB`), `features jsonb` yalnız izinli boolean anahtarlar: `public_voting`, `mystery_hunt`, `easter_eggs`, `mascot_naming`.
- DB, başlık/renk/özellik değişiminin zaman ve aktörünü audit'e yazar; `admin_update_event` genel JSON allowlist'i kontrolsüz genişletilmez. Ayrı `update_community_branding(p_actor,p_login,p_community,p_changes)` ve `update_event_presentation(p_actor,p_login,p_event,p_color,p_features)` RPC'leri; rol, askı, Plan 4 onayı ve izinli alanlar SQL'de doğrulanır.
- Renk yalnız HEX; SVG/CSS/URL/custom style girilemez. Güncel markanın SHA kayıtlarına veya başka topluluğa etkisi yoktur.

- [ ] Önce normalize/kontrast/default/allowlist testleri. Varsayılan özellikler oluşturulan etkinliğin gerçek topluluğundan belirlenir; formdan gönderilen `isDeu` benzeri değere güvenilmez.
- [ ] DEÜ seed etkinliklerinde mevcut seçenekleri koruyan backfill; diğer topluluklar false. Yeni etkinlik oluşturma RPC'si aynı varsayılanları atomik kurar; DB default'u bütün topluluklarda true olamaz.
- [ ] Teknik öneri: özellik değişimi yalnız etkinlik başlamadan ve ilgili oy/öneri/gizem kaydı oluşmadan mümkün. Başladıktan sonra kapatarak var olan oyları veya kazanımları görünmez yapma yolu yok. Renk/logo adlandırma ayarları ayrı; kilit sonrasında etkinlik sunumu dondurulur. Topluluk ana logosu ileride değişse de mühürlü sergi başlığı/renk/logo kimliği için kilitte alınan `event_brand_snapshot` kullanılır.
- [ ] Marka snapshot'u yalnız görünüm bilgisi; teslim hash'inin parçası değildir. Kilit zamanında snapshot yoksa worker tek sefer tamamlar; hash/SHA alanlarını değiştirmez. Eski kilitli etkinlikler migration anındaki bilinen DEÜ markasıyla `legacy` kaynak notu alır; geçmişteki bilinmeyen logo varmış gibi üretilmez.
- [ ] `npm run check` + DB; commit: `Topluluk markası ve etkinlik özellikleri için kapsamlı ayarlar`.

## Task 2 — Logo ve renk işleme

**Ekle:** `lib/brand-logo.ts`, `components/branding-form.tsx`, `components/event-brand.tsx`. **Değiştir:** topluluk panosu, etkinlik yönetimi, logo upload/telafi ve `lib/storage-sweep.ts`.

- [ ] Logo sunucuda `sharp` ile gerçek görüntü olarak çözülür, yönü düzeltilir, yeniden kodlanır ve metadata atılır. SVG ve animasyon kabul edilmez. Öneri: PNG/JPEG/WEBP, en fazla 1 MB çıktı, mevcut kare logo boyut kuralı; HTML/SVG taklidi ve aşırı piksel boyutu reddedilir. Mevcut proje logosu deseni yeniden kullanılır.
- [ ] Dosya yolu `topluluk/<community-id>/<rastgele>.webp`; istemci keyfi Storage yolu veremez. Upload sonrası DB RPC başarısızsa dosya telafiyle silinir; yarışan güncellemelerde kaybeden dosya sahipsiz temizlikte toplanır.
- [ ] Mevcut `sweepStorage` proje logolarını koruyor, topluluk/snapshot logolarını henüz bilmiyor. Koruma kümesine yaşayan topluluk logo referansları ve donmuş `event_brand_snapshot` referansları eklenmeden yeni prefix temizliğe açılmaz. Prefix taraması gerçek klasör derinliğine göre yapılır.
- [ ] Saf renk hesapları: metin için en az 4.5:1, gerekli kontrol/odak göstergelerinde en az 3:1. Hem açık hem koyu tema için kullanılan bütün token çiftleri sınanır. Okunamayan renk kaydetmede reddedilir ve yakın geçerli öneri gösterilir; sessizce farklı renge çevrilmez. Koyu ton türetimi deterministik, sunucuda ve istemcide aynı.
- [ ] Marka formu açık/koyu önizleme, açık alan etiketleri, server-side hata ve taslak koruması içerir; renk tek anlam taşıyıcısı olmaz.
- [ ] Sahte dosya, upload/DB hatası, iki eşzamanlı logo, eski mühürlü sergi logosunun korunması ve iki farklı topluluğun renk yalıtımı testleri.
- [ ] Commit: `Doğrulanan topluluk logosu ve iki temada okunabilir etkinlik rengi`.

## Task 3 — Marka ve özellikleri bütün yüzeylere bağla

**Değiştir:** `components/site-header.tsx`, `site-footer.tsx`, `event-list.tsx`, `vitrine.tsx`, `save-egg.tsx`, `key-eggs.tsx`, `mystery-egg.tsx`, `app/layout.tsx`, `app/e/[slug]/layout.tsx`, etkinlik/panel/sahne/belge/maskot/yönetim sayfaları, sergi/eser/makbuz, OG ve kazanan görselleri, API QR/rozet/belge, `lib/mascot-naming.ts`, `app/actions.ts`, maskot actions'ları ve canlı status sürümü.

- [ ] Tek sunucu görünüm modeli: etkinlik + topluluk + donmuş snapshot + doğrulanmış özellikler. Header, PNG, SVG ve RSC aynı karar fonksiyonlarını kullanır. Public DTO iletişim verisi içermez.
- [ ] Etkinlik başlığı topluluk adı/logosu, etkinlik adı ve `mühür. ile` imzası; ana sayfa listesindeki placeholder yerine onaylı logo. Logo yoksa mevcut baş harf yedeği. Platform sayfası kendi Mühür kimliğini kullanır.
- [ ] Root layout'taki `SaveEgg`/`KeyEggs` koşulsuz montajı kaldırılır; uygun etkinlik katmanına taşınır. Diğer toplulukta hem görünen maskotlar hem kısayol/konsol sürprizleri devre dışıdır. Paylaşım kartı, belge ve 404/makbuz gibi dolaylı yüzeyler de kontrol edilir.
- [ ] UI gizlemek yetmez: vote/gizem/maskot eylemleri ve API'ler özellik denetimi yapar. DB vote/mystery/mascot yazma guard'ları aynı kapalı durumunu reddeder. İsmi kapalı maskot endpoint'i 404; diğer kapalı yazma açık ve Türkçe feature-disabled mesajı verir. İstemcinin boolean alanı bypass olamaz.
- [ ] `hasMascotNaming` hem DEÜ scope'unu hem etkinlik bayrağını kontrol eder; Plan 2'de eklenen beş action koruması korunur. Jüri kendi etkinliğinde halk oyu kullanamaz; oy için GitHub identity koşulu devam eder.
- [ ] Status versiyonuna marka/özellik/snapshot sürümü eklenir; farklı etkinliğe ait değişiklik mevcut sayfayı kirletmez. QR/rozet yolları eski bağlantıları korur.
- [ ] Masaüstü/390px, açık/koyu tema ve reduced motion: DEÜ + ikinci topluluk + kilitli snapshot + özelliklerin tümü kapalı. Başka topluluk HTML/SVG/PNG çıktısında DEÜ maskotu yok. Sadece metin aramasıyla görsel doğrulama tamamlandı sayılmaz; screenshot'lar incelenir.
- [ ] Commit: `Etkinlik markası ve özelliklerini bütün yüzeylerde uygula`.

## Arşiv saklama mimarisi

Mevcut `storage-sweep` yalnız sahipsiz, en az 24 saat eski dosyaları temizler. Referanslı kabul/mühür arşivlerini özellikle korur. Bu işi 30 günlük saklama gibi kullanmak yanlış olur; **ayrı süreli silme işçisi** eklenir.

### `0020_arsiv_saklama_temeli.sql` — additive, silme kapalı

- `events.archive_expires_at`: kalıcı `locked_at + interval '720 hours'`; kilit yokken null. `deadline` geçti ama lock kaydı yoksa önce mevcut `ensureLocked` akışı çalışır. Plan 2'deki görünüm `sealTime` ile yeni bir farklı sayaç üretilmez; süre kaynağı burada açıkça `locked_at`tır. Eski etkinliklerde gerçek DB değeri kullanılır, belgeye yazılmış tarihler kaynak sayılmaz.
- Sunucuda `archiveAvailability(event, now)` → `available|expiring|expired`; kararın zaman kaynağı DB'dir. Dosya henüz silinmemiş olsa da süre sonunda yeni indirme başlatılmaz.
- `archive_expiry_runs(id,event_id,expires_at,state,manifest_hash,created_at,completed_at,last_error)`; event tekil iş. Manifest kanıtı ve durumları geri alınamaz şekilde ilerler; audit kaydı bağlantılıdır.
- `archive_expiry_objects(id,run_id,event_id,bucket,path,reference_summary,state,lease_token,lease_until,attempts,next_attempt_at,deleted_at,last_error)`; `(bucket,path)` tekil; bucket yalnız `archives`. Bir yol kabul edilmiş ve mühürlü alanda aynı anda geçiyorsa bir kez silinir. Dosya manifesti bütün submission geçmişini ve snapshot'ları kapsar; yalnız son ZIP'e bakılmaz.
- Durum: `pending → processing → deleted`; hata yeniden `pending`/terminal `failed`. Eski lease tokenıyla bitirme reddedilir. Object sonradan bulunamıyorsa Storage'ın açık not-found sonucu idempotent başarıdır; erişim/5xx/okuma hatası bulunamadı sayılmaz.
- **Asıl kanıt tabloları değiştirilmez:** `projects` ve `submissions` üzerindeki accepted/frozen SHA, hash, byte, archive path ve zamanlar olduğu gibi kalır. Silinme zamanı ayrı expiry ledger'ına yazılır; `archive_pruned_at` ile mühürlü kabulün eski budama istisnası delinmez. UI kayıtları ledger'dan türetir. Snapshot metadata kayıtları da korunur.
- Referans listesinde farklı etkinliğe bağlı aynı path, kapsam dışı prefix veya okuma/sayfalama eksikliği varsa o manifest hazırlığı durur; hiçbir dosya silinmez. Silinebilir prefix'ler yalnız uygulamanın ürettiği `teslim/<job>.zip` ve `ara-muhur/<slug>/...`; logo/başka bucket asla bu kuyrukta bulunmaz.
- FK'ler, RLS ve grant: istemcilerin okuma/yazması yok; ledger'ı yalnız sunucu yardımcıları değiştirir. Onay tokenı veya service key gösterilen raporda bulunmaz. Audit arşiv içeriğini kaydetmez.

RPC sözleşmeleri:
- `prepare_archive_expiry(p_event)` → eksiksiz DB referans taraması, kilit/son tarih kontrolü ve deterministik manifest/hash; henüz Storage silmez.
- `claim_archive_expiry_objects(p_limit)` → yalnız aktive edilmiş, vadesi gelmiş işlerde `FOR UPDATE SKIP LOCKED`; süreli lease/token.
- `complete_archive_expiry_object(p_id,p_token)` → geçerli lease, süre ve scope doğrulaması; deleted_at ve audit atomik. Storage silindikten sonra çağrılır.
- `fail_archive_expiry_object(p_id,p_token,p_error)` → sınırlı retry; ilk başarısız dosyada bütün işi bitmiş saymaz.
- `finalize_archive_expiry(p_run)` → bütün manifest nesneleri terminal deleted ise tamamlar; eksik mühür/teslim kanıtını icat etmez.
- `archive_retention_enabled` platform ayarı yalnız head admin taze oturum ve gerekçeyle etkinleştirilebilir; topluluk sahibi süre uzatamaz veya saklama temizliğini atlatamaz. Varsayılan false; `0021` okuyucu uyumluluğunu denetleyip bu ayarın kontrollü etkinleştirilmesine izin veren son kapıdır, kendi başına Storage silmez.

## Task 4 — Saklama defteri ve kuru koşum

**Ekle:** `0020`, `0021`, `lib/archive-retention.ts`, `scripts/preview-archive-expiry.mjs`, `tests/database-retention.sql`, `tests/archive-retention.test.mjs`. **Değiştir:** `ensureLocked`/worker metadata yolu, veri DTO'ları, DB/stres migration listeleri.

- [ ] Önce SQL: 30 gün eksi 1ms, tam eşik, artı 1ms; erken kilit; farklı etkinlikler; lock null; kalıcı lock zamanının değiştirilememesi; aynı path'in tekilleşmesi.
- [ ] Manifest eksiksizliği: accepted/frozen kopya, eski submission, prune edilmiş eski dosya ve snapshot; 1000 satır üstünde kararlı sayfalama ve beklenen toplam kontrolü. İlgisiz etkinlik/yol dahilse fail-closed.
- [ ] Dry-run betiği salt okunur: etkinlik, gerçek lock/expiry, dosya sayısı/boyut ve manifest hash; Storage delete çağrısı yok. Canlı rapor çıktı metnindeki tarih bilgisiyle hardcode edilmez. EkoZeka için de gerçek tarih sorgulanır.
- [ ] DB + manifest/hash + read-error testleri. `0020` uygulanmışken eski sürüm çalışmaya devam eder; silme kapalı kalır.
- [ ] Commit: `Arşiv saklama defteri ve salt okunur silme önizlemesi`.

## Task 5 — Bütün okuyucularda süre sonu davranışı

**Değiştir:** `app/api/arsiv/[id]/route.ts`, `app/api/juri/[slug]/route.ts`, `lib/jury.ts`, `lib/data.ts`, `app/dogrula/actions.ts`, `app/dogrula/verifier.tsx`, `components/seal-record.tsx`, delivery paneli, eser ve makbuz sayfaları, yönetim CSV'si ve hata/iş tekrar deneme UI'si.

- [ ] Önce kimlik ve scope yetkisi; sonra saklama durumu. Yetkisiz kullanıcı süresi dolmuş özel arşivin varlığını 410 üzerinden öğrenemez.
- [ ] Yetkili tekil indirme süre sonunda **410** ve `Arşivin 30 günlük saklama süresi doldu.` döner. Eksik/kayıp dosya (beklenmeyen hata) ile politika gereği silinen dosya ayrı gösterilir.
- [ ] İmzalı URL ömrü en fazla kalan saklama süresi ve mevcut kısa URL sınırıdır; süre çok azsa yeni URL verilmez. Önceden üretilen URL'nin politikadan sonra geçerli kalmasına izin verilmez.
- [ ] Jüri ZIP'i süre sonunda 410; CSV/manifest kanıtı indirilebilir ve `archive_status=expired` / deleted_at / expiry alanlarını içerir. Salt dosya talebi, metadata talebinden ayrılır. `paket=gecerli` expired arşivi hâlâ varmış gibi listeleyemez.
- [ ] Uzun paket indirmesi ile expiry yarışında başlangıç kontrolü + nesne başına tekrar kontrol. Süre/nesne hatasında stream açık hata ile iptal edilir; yarım ZIP başarılı/eksiksiz paket gibi sunulmaz. Retention worker reader'ı sınırsız bekleyen bir lease yüzünden durmaz.
- [ ] SHA doğrulama, makbuz ve rozet çalışır: `Mühür kaydı geçerli; dosyanın saklama süresi doldu.` Metin hash eşleşmesini saklama süresiyle karıştırmaz. Sunucunun dosyayı yeniden indirip doğruladığı iddia edilmez.
- [ ] Retry/freeze yolları expiry sonrası ZIP'i yeniden yüklemez veya GitHub'dan güncel HEAD'i arşivleyip eski teslimi canlandırmaz. İşçi süre dolmuş işi tekrar mühürlemeye kalkmaz; hata reason'u retention olarak görünür.
- [ ] Regresyon: eski sealed/hash doğrulaması, iki etkinliğin farklı vadesi, sahte expired ID, tam cutoff anında imzalı URL ve jury stream.
- [ ] Commit: `Arşiv okuyucularında saklama süresi ve kanıt ayrımı`.

## Task 6 — Silme işçisi ve aktivasyon

**Ekle:** `lib/archive-expiry-worker.ts`, `app/api/cron/archive-expiry/route.ts`, `tests/archive-expiry-worker.test.mjs`. Ayrı cron, mevcut teslim/mühür işçisinden bağımsız lease ve küçük süre bütçesi.

- [ ] İşçi, claim edilen path'leri Storage API ile siler; yalnız başarılı/not-found sonuçtan sonra ledger tamamlanır. DB bitirme hatasında dosya silinmiş olabilir: sonraki tur not-found ile idempotent tamamlar. Tersi sırayla önce deleted_at yazılmaz.
- [ ] İki worker, silme ortasında süreç kaybı, lease süresi bitmesi, Storage 429/5xx, DB tamamlama hatası, eksik obje, bozuk scope ve audit hatası testleri. Tokenı kaybeden işçi yeni bir dosyayı silemez; manifest yolları değiştirilemez. Aynı vadedeki farklı etkinliklerde adil küçük batch.
- [ ] Süreli temizliğin yaptığı silme sayısı, hata sayısı, en eski vadesi geçmiş iş ve son başarı platform yönetiminde görünür. Topluluk kendi etkinliğinin expiry/başarı durumunu görebilir; platform geneli kuyruk başkasına açılmaz.
- [ ] Bütün okuyucular yeni sürümdeyken, `0021` aktivasyon kapısı ve gerçek dry-run raporu kontrol edilir. Canlı silme açılmadan önce kullanıcıya etkinlik/dosya sayısı/manifest özeti sunulur ve açık onay alınır. Gerekli yerel yedekler bu noktada hazırlanmış olmalıdır; onay, bu plan dosyasının yazılmış olmasından türetilmez.
- [ ] Aktivasyon sonrası ilk küçük parti kontrol edilir; hata varsa yeni claim kapatılır, eski ledger ve kanıt korunur. Kapatmak daha önce silinen dosyaları geri getirmez; geri alma planı bunu açıkça belirtir. Yeni belirsiz bir dosya listesiyle toplu delete yapılmaz.
- [ ] Commit: `Yeniden denenebilir süreli arşiv silme ve kontrollü aktivasyon`.

## Task 7 — Bütünleşik doğrulama ve genel açılış

- [ ] Test preview: DEÜ, ikinci topluluk, özellikleri kapalı etkinlik, iki tema, farklı logo/renk, eski marka snapshot'u, vadesi yakın ve expired teslim; expired ama geçerli SHA.
- [ ] `npm run check`, build, DB, routes, browser, event-isolation; mevcut deadline/stres güvenceleri. Marka ve retention testlerinde canlı Storage kullanılmaz.
- [ ] Migration sırası: `0019` → `0020` (silme kapalı) → uygulama yayını → okuyucu/marka/özellik provası → gerçek dry-run → ayrı onayla `0021`/worker açılışı. Eski okuyucular yayındayken süreli silme açılmaz.
- [ ] Plan 3 Brevo/LinkedIn ve Plan 4 gerçek belge girdileri de doğrulanır. Genel topluluk başvurusu sunucu anahtarı bu üç planın yayın kontrolleri kapandıktan sonra açılır. Tek başına bir buton eklenmesi ürünün açıldığı anlamına gelmez.
- [ ] Planın tamamlanma kaydı kanıtlarla güncellenir; PR/uzak aktarım ve canlı işlemler için mevcut yetkilendirme izlenir.

## Bitiş ölçütü

İki topluluk farklı markalarla görünür; diğer toplulukta DEÜ maskotu/özellikleri sızmaz. Kapalı özellikler doğrudan action/SQL çağrısında da kapalıdır. 30 günlük eşikte yeni indirme durur; Storage/DB arasındaki hata veya tekrarlar yanlış dosyayı silmez. ZIP silindikten sonra mühür ve doğrulama kanıtı okunabilir kalır. Topluluk/snapshot logoları sahipsiz dosya temizliğinde yanlışlıkla silinmez.

## Teknik kaynaklar

Kontrast eşikleri W3C'nin [metin kontrastı](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) ve [metin dışı kontrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) açıklamalarına göre seçildi. Küçük metinde daha düşük büyük-yazı istisnası kullanılmaz. Kaynaklar 13 Kasım 2026 tarihinde kontrol edildi.

## Uygulama kaydı (16 Kasım 2026)

Dal: `feat/sozlesme-surumleri` (Plan 4 `90235bc` üzerinden). Task başına commit; uzak aktarım, canlı migration ve canlı silme yapılmadı.

**Ön düzeltme** (`48873d2`): Plan 4'ün `0017` ve `0018` migration'larında eski üyeliklerden `legacy` kayıt üreten INSERT'lerde `source` değeri eksikti; migration'lar hiç uygulanamazdı. İkisi de canlıya uygulanmadığı için yerinde düzeltildi. Plan 4 SQL testleri ilk kez (PGlite ile) çalıştırıldı ve geçti.

**Migration'lar**
- `0019_marka_ve_ozellikler.sql` (additive): `communities.logo_path` (kendi `topluluk/<id>/` önekine bağlı), `branding_updated_at`; `events.accent_color` (yalnız `#rrggbb`, SQL'de 4.5:1 kontrast), `features` (dört izinli boolean), `presentation_updated_at`; gerçek topluluktan atomik varsayılan (DEÜ açık, diğerleri kapalı; insert tetikleyicisi); sunum alanları yalnız `update_event_presentation` içinden; kapalı özellikte oy/gizem/maskot yazmaları ve oylama açılışı DB'de reddedilir (`OZELLIK:`); maskot bayrağı DEÜ dışında hiçbir yoldan açılmaz; başladıktan sonra ve kaydı olan özellik kapatılamaz; kilitte `event_brand_snapshots` (değişmez; legacy kayıt logo uydurmaz); `update_community_branding` (yalnız sahip, Plan 4 onayı, izinli alanlar).
- `0020_arsiv_saklama_temeli.sql` (silme kapalı): `events.archive_expires_at = locked_at + 720 saat`; `archive_availability/archive_access` (DB saati); `archive_expiry_runs/objects` defteri; fail-closed manifest; `prepare/claim/complete/fail/finalize`; ilk claim'de manifest değiştiyse iş `blocked`; süresi dolmuş etkinlikte yeni mühür işi ve mühür yazımı yok; `archive_retention_settings` (varsayılan kapalı), `confirm_archive_readers`, `set_archive_retention`, `archive_retention_report`.
- `0021_arsiv_saklama_aktivasyonu.sql`: okuyucu onayı + kuru koşum özeti yoksa durur; yalnız kapıyı açar, silmeyi açmaz.

**Uygulama**: `lib/branding.ts`, `lib/event-features.ts`, `lib/brand-logo.ts`, `lib/storage-keep.ts`, `lib/brand-image.ts`, `lib/event-og.tsx`, `components/event-brand.tsx`, `event-surface.tsx`, `event-mascot.tsx`, `branding-form.tsx`, `neutral-pages.tsx`; başlık/alt bilgi/liste/vitrin/panel/sahne/makbuz/OG/kazanan/belge tek karar fonksiyonuna (`eventShowsMascot`) bağlandı; kök düzendeki koşulsuz sürprizler kaldırıldı; etkinlik içi ve kök 404 maskotsuz. Saklama: `lib/archive-retention.ts`, `archive-manifest.ts`, `archive-access.ts`, `archive-expiry-worker.ts`, `archive-expiry.ts`, `/api/cron/archive-expiry`, `supabase/cron/plan5_archive_expiry.sql` (canlıya kendiliğinden uygulanmaz), `scripts/preview-archive-expiry.mjs` (salt okunur), platform yönetiminde saklama raporu, okuyucu onayı ve gerekçeli aç/kapa.

**Testler**
- Geçti: `npm run check` (birim testleri, lint, tsc); PGlite (WASM PostgreSQL) üzerinde 0001–0021 ve bütün SQL testleri, yeni `database-branding.sql`, `database-retention.sql`, `database-retention-gate.sql`; 0021'in onaysız durduğu; TS/SQL kontrast (3005 renk) ve manifest özeti eşliği. Sahte Supabase + dev sunucu: `tests/branding-routes.mjs`, `tests/retention-routes.mjs`, `tests/routes.mjs` (aşağıdaki önceden var olan hata dışında); `tests/branding-browser.mjs` (masaüstü/390px, açık/koyu, azaltılmış hareket; ekran görüntüleri ve OG kartları elle incelendi).
- PGlite tek bağlantılıdır: iki bağlantılı yarış testleri (`policy-races`, `community-races`, stres) ve gerçek PostgreSQL ile `npm run test:db` bu makinede çalıştırılmadı. PGlite'ta milisaniye çözünürlüğüne bağlı iki eski zamanlama testi (`database.sql` erken kilit, `database-activity.sql`) ara sıra takılıyor; tekrar koşumda geçiyor.
- Önceden var olan sorun: `tests/routes.mjs` "ikinci-etkinlik paneli" kontrolü dev modunda önceki isteğin projesini RSC hata ayıklama verisine karıştırıyor (Plan 4 kaydında da var). Plan 5 kontrolleri bu yüzden ayrı dosyada.

**Açık kalan yayın adımları** (sıra korunur, her biri ayrı onay): `0019` → `0020` → uygulama yayını → marka/özellik ve okuyucu provası → `npm run preview:archive`/`scripts/preview-archive-expiry.mjs` ile gerçek kuru koşum (EkoZeka dahil gerçek tarihler) → kullanıcıya etkinlik/dosya sayısı/manifest özeti → platform yönetiminden okuyucu onayı → `0021` → kullanıcıdan açık onay → head admin `set_archive_retention(true)` → `plan5_archive_expiry.sql` cron'u → ilk küçük partinin kontrolü. Kapatmak (`set_archive_retention(false)`) yeni claim'i durdurur; silinmiş dosyaları geri getirmez. Genel topluluk başvurusu anahtarı Plan 3/4/5 yayın kontrolleri kapanana kadar kapalı kalır.
