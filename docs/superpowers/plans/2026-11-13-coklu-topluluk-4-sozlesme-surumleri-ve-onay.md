# Çoklu topluluk · Plan 4: Sözleşme sürümleri ve yeniden onay

Tarih: 13 Kasım 2026 · Durum: uygulanacak plan; kodlanmadı.

**Amaç:** kimin, hangi belgeyi, hangi sürümde, hangi topluluk/etkinlik için, ne zaman kabul ettiğinin değişmez kaydı; yönetici belgeleri yenilendiğinde yeniden onay; katılımcının etkinliğe ilk katılımında ayrı platform ve etkinlik kural onayı.

**Bağımlılık:** Plan 3'teki `policy_documents`, `policy_requirements`, `policy_subjects`, `policy_acceptances`, doğrulanmış çok sağlayıcılı Viewer ve topluluk/davet RPC'leri. Bu tablolar yeniden yaratılmaz. Yeni migration önerileri `0017_sozlesme_uygulama.sql` (additive hazırlık) ve `0018_sozlesme_zorunlulugu.sql` (yayın sonrası aktivasyon); uygulama anında numara ve Plan 3'ün gerçek şeması doğrulanır.

**Kapsam:** yazılımın belge yayınlama, kabul ve işlem engelleme mekanizması. Hukuki sözleşme metni hazırlanması bu planın çıktısı değildir; tasarımdaki yayın öncesi metin incelemesi ayrı girdidir. Başvuru ve yönetim ekranlarında örnek metinler gerçek sözleşmeymiş gibi sunulmaz.

## Kesin kurallar

1. Belge içeriği/version/hash istemciden alınmaz. Sunucu yayınlanmış kayıt ve beklenen belge kimliklerini bulur; kullanıcı yalnızca açık checkbox'larla onay verir.
2. Yayınlanmış metin yerinde değiştirilmez veya silinmez; yeni metin yeni sürümdür. Eski sürüm URL'si ve eski kabul kanıtı kalır. SHA-256, gösterilen aynı UTF-8 belge metninin baytlarından hesaplanır; satır sonu/NFC politikası yayınlama sırasında sabitlenir.
3. Geçerli sürüm işaretçisi ile işlem aynı transaction kilit düzenini kullanır. Kullanıcı formu açıkken sürüm değişirse eski sürüm sessizce kabul edilmiş sayılmaz; yeni belge gösterilerek tekrar onay istenir.
4. Sahip/organizatörün eksik güncel onayı yönetim yazmalarını durdurur. Salt okuma, oturumdan çıkış, belge okuma ve onay verme açık kalır. Head admin'in platform incelemesi/askı/kurtarma yetkisi bir topluluk adına sözleşme kabulü sayılmaz.
5. Katılımcı için kabul etkinliğe ilk kayıt/katılım anına bağlanır. Yeni platform belge sürümü mevcut etkinliğin teslim güncellemesini veya daha önceki kabulünü engellemez; sonraki etkinlik kaydında istenir. Mevcut teslim ve mühür worker'ı belge kabulünden etkilenmez.
6. Etkinlik kuralı, platform koşulundan ayrı checkbox ve ayrı kanıttır. Harici URL'nin içeriğinin değişmezliği garanti edilmez; kanıt kaydı o anda kabul edilen URL, sürüm ve varsa topluluğun sunduğu içerik hash'ini gösterir. Kaynak alınmadan sayfanın metni/hash'i doğrulanmış gibi gösterilmez.
7. Geçmiş EkoZeka kullanıcılarına sahte kabul tarihi veya checkbox kaydı yazılmaz. Eski üyelik `legacy` kaynağıyla ayrı işaretlenebilir; bu sözleşme onayı değildir.
8. Onay işleminde aktör, scope ve belge türü sunucuda doğrulanır; başka kişinin kimliği, başka topluluğun onayı veya başka etkinliğin kural sürümü kullanılamaz.

## Veri ve SQL sözleşmesi

### Mevcut temelin genişletilmesi

- `policy_documents`: yayınlanmış satırlarda içerik/hash/version/tür değişimini ve silmeyi reddeden trigger. Draft içeriği yayınlanana kadar güncellenebilir. Tür/sürüm tekilliği korunur.
- `policy_requirements`: tür başına geçerli yayınlanmış sürüm, `activated_at`; hedef belge türü ile işaretçi türü SQL'de eşleşir. Eski onaylar bu işaretçi değişti diye silinmez.
- `policy_acceptances`: yalnızca ekleme; `(subject,document,scope_kind,scope_id)` tekilliği. Scope gerçek topluluk/etkinliğe çözülür; polimorfik UUID'nin geçerliliğini yalnız TypeScript'e bırakma.
- `event_terms_versions(id,event_id,version,rules_url,privacy_url,content_sha256 NULL,created_by,created_at)`; ekleme sonrası değişmez. Dış sayfalar sunucudan otomatik indirilmez; URL doğrulaması SSRF fetch'i başlatmaz. Hash ancak gerçek sabit içerik sağlanmışsa kullanılabilir.
- `events.current_terms_version_id`: yalnız kendi etkinliğinin sürümüne FK/trigger ile bağlanır. İlk katılımcı kaydı veya başlangıçtan sonra kural sürümü değiştirilemez (teknik öneri); böylece aynı etkinlikte sonradan farklı kurala tabi ekip oluşmaz. Yeni etkinliğin ilk kural sürümü etkinlik oluşturma transaction'ında kurulur; sonradan düzenleme bu sınırı aşamaz. Plan 3 bağlantıları ilk sürüme taşınır; olmayan eski bağlantılara sahte metin konmaz.
- `participant_enrollments(user_id,event_id,source,participant_document_id,event_terms_version_id,accepted_at)`: tekillik kullanıcı/etkinlik; `source=accepted|legacy`. Legacy satırlarında sözleşme belge/tarih kanıtı boş kalır. Ekipten ayrılmak kaydı silmez; aynı etkinliğe yeniden katılım mevcut enrollment'ı kullanır. Bu tablo proje üyeliğinin yerine geçmez.
- `event_terms_acceptances(user_id,event_id,terms_version_id,accepted_at)` ekleme-only; enrollment ve kabul satırları birbirine bağlanır. Bir kural checkbox'ı hem platform hem etkinlik onayı sayılmaz.

### RPC'ler

| RPC | Denetim ve sonuç |
|---|---|
| `publish_policy_document(p_actor,p_login,p_document,p_expected_current,p_reason)` | Head admin + sunucu taze oturum; draft'ı yayınla ve requirement işaretçisini atomik değiştir; beklenen mevcut sürüm tutmuyorsa reddet; audit |
| `accept_management_policies(p_actor,p_login,p_community,p_document_ids)` | Sahip/organizatör; yalnız ilgili güncel belge seti; onayları tek transaction'da ekle; eski sürümse okunabilir hata |
| `assert_management_policies(p_actor,p_community)` | Yan etkisiz güncel kayıt denetimi; eksikse `ONAY:` öneki ve sunucunun çevireceği mesaj; tek başına istemciye açık değil |
| `set_event_terms(p_actor,p_login,p_event,p_expected_version,p_rules_url,p_privacy_url,p_content_sha256)` | Etkinlik yöneticisi, askı ve güncel yönetici onayı; başlangıç/kayıt sonrası reddet; immutable sürüm ekle ve işaretçiyi değiştir; audit |
| `register_project_with_terms(...mevcut kayıt alanları...,p_document,p_terms_version)` | Güncel platform/kural sürümünü doğrula; açık kullanıcı onaylarıyla kabul+enrollment+proje+ilk teslim işini tek transaction'da oluştur |
| `join_project_with_terms(p_code,p_actor,p_login,p_avatar,p_document,p_terms_version)` | Etkinliği davet kodunun projesinden çöz; aynı kabul/üyelik atomikliği ve mevcut davet yarış koruması |

Mevcut `register_project`/`join_project_by_code` girişleri kabul denetimini atlatan yol olarak bırakılamaz. Tercih: eski gövdeler iç yardımcı olur, servis rolüne execute kapatılır; yeni girişler eski güvenli gövdeyi transaction içinde çağırır. İç fonksiyonlar tetikleyicilerden çağrılabiliyorsa grant'ler buna göre düzenlenir. SQL ve stres düzeneği yeni giriş sözleşmesine geçirilir. Geçerli enrollment'ı olan kişinin tekrar denemesi idempotenttir; ilk kabul ile kayıt başarısızsa birlikte rollback olur.

### İşlem ve kilit düzeni

Plan 3 kullanıcı/scope kilit sırası korunur. Belge işaretçisi `FOR SHARE` kilidi kayıt ve yönetim işleminde aynı transaction boyunca tutulur; yayın `FOR UPDATE` alır. Belge yayınlama yolu topluluk/etkinlik satırları kilitlemez; kullanıcı işlemleri ortak tanımlı sırayı takip eder. İki bağlantılı testle mevcut yönetim/katılımcı kilitleriyle deadlock olmadığı kanıtlanır. Sadece uygulama katmanında önce kontrol-sonra yazma yapılmaz.

## Task 1 — Değişmez sürüm ve yayınlama

**Ekle:** `0017`, `0018`, `lib/policies.ts`, `tests/policies.test.mjs`, `tests/database-policies.sql`, `scripts/publish-policy.mjs`, `content/policies/README.md`. **Değiştir:** DB/stres migration listeleri, `.env.example` gerekiyorsa yalnız sunucu ayarları.

- [ ] Plan 3 temel şemasını oku; yinelenen tablolar olmadan migration yaz. İçerik/hash normalizasyonunu saf fonksiyonla tanımla; hash değiştirilmiş metinle eşleşmezse yayın reddedilir.
- [ ] Draft/published/retired ve eski sürüm erişimi; işaretçi hedefinin tür/status kontrolü; published içeriğe UPDATE/DELETE ve acceptance UPDATE/DELETE testlerini önce ekle.
- [ ] Yerel içerik dosyasını preview etme → draft hazırlama → taze oturumlu head admin ile yayın RPC'si. Betik doğrudan belge işaretçisini güncelleyemez; service key tek başına aktör yetkisi sayılmaz. İlk canlı belge metni taslak etiketiyle otomatik yayınlanmaz.
- [ ] Belge URL'leri: `/kosullar/platform/<version>`, `/kosullar/veri-isleme/<version>`, `/kosullar/katilimci/<version>`; yalnız published/retired sürüm. Draft herkese gösterilmez. Sürüm ve hash sayfada görünür; kullanıcı metnin tamamına ulaşır.
- [ ] `npm run check`, DB ve içerik/hash testleri; commit: `Değişmez sözleşme sürümleri ve denetimli yayınlama`.

## Task 2 — Yönetim işlemlerinde yeniden onay

**Değiştir:** `lib/access.ts`, `lib/authz.ts`, topluluk ve etkinlik yönetim actions'ları, `require_event_manager`, `admin_create_event`, Plan 3 davet/üyelik RPC'leri. **Ekle:** `components/policy-consent-form.tsx`, `/topluluk/[slug]/onay`.

- [ ] Ayrı durum: rol yeterli ancak güncel belge eksik. Kullanıcıya Yetkisiz/404 yerine hangi belgeyi onaylaması gerektiği gösterilir. Bu durum gerçek rol bilgisini başkasına açmaz.
- [ ] Topluluk ayarı, etkinlik oluşturma/zaman/duyuru/kilit/ödül, davet oluşturma/üyelik çıkarma/sahiplik devri gibi organizatör yazmaları DB seviyesinde guard'dan geçer. Plan 3 sahiplik kurtarma ve platform askı RPC'leri aynı şey değildir; head admin acil erişimi yanlışlıkla kapatılmaz.
- [ ] Operasyonel okuma, kabul edilmiş teslimin mühürlenmesi, cron kilidi ve bakım işçisi devam eder. Teslim yeniden deneme/head admin işletimi yeni topluluk sözleşmesine bağlanmaz; yeni içerik yönetimi ile mevcut kanıtı tamamlama ayrılır.
- [ ] Yeni yönetim ziyaretinde/kayıtlı belge sürümü değişiminde kabul ekranı; API her yazmada DB denetimi yapar. Açık eski formun checkbox'ı yeni sürüme otomatik taşınmaz. `next` yalnız güvenli aynı site yolu; onay sayfasına kendi kendini yönlendirme döngüsü yok.
- [ ] Davet kabulü sırasında rol kurulması ve kabul edilen belgeler aynı transaction'da; kimse henüz üye değilken onay verme akışında kilitlenmez. Scope'a üye olma niyeti geçerli davetle doğrulanır.
- [ ] Test: belge yayınıyla eşzamanlı duyuru/lock/rol devri; başka topluluğun kabulü geçersiz; stale session ve onay eksikliği ayrı hata; aynı checkbox'ın iki kez gönderilmesi tek acceptance.
- [ ] Commit: `Topluluk yönetiminde güncel belge onayı`.

## Task 3 — Katılımcı kayıt ve ekip katılımı

**Değiştir:** `app/actions.ts`, `components/project-form.tsx`, `components/join-form.tsx`, `/davet/[code]`, etkinlik paneli; kayıt SQL testleri ve stres kaydı girişleri. **Ekle:** enrollment ve event terms SQL fonksiyonları, `tests/participant-policies.test.mjs`.

- [ ] Yeni kullanıcıya platform koşulları ve etkinlik kuralları/aydınlatma iki ayrı onay olarak gösterilir; önceden işaretlenmez. Sunucu checkbox'ların kendisini doğrular; belge ID'sinin formda bulunması onay sayılmaz.
- [ ] Enrollment + proje/üyelik atomik RPC'leri; yetkisiz belge sürümü, sahte event ID, geçersiz davet, yarışma rolü, süre ve askı denetimleri korunur. Kullanıcı verdiği onaydan sonra farklı etkinliğe kaydedilmez.
- [ ] Geçerli ilk kayıt sonrası katılımcı policy sürümü değiştiğinde teslim, ekip bilgisi ve mühür akışını durdurma. Sonraki etkinlikte yeni onay; aynı etkinliğe yeniden katılım önceki enrollment üzerinden.
- [ ] Legacy eski üyelikler migration'da gerçek üyeliklerden türetilir, belge kabul tarihi üretilmez. Eski açık etkinliğe ilk kez katılacak kişi için geçerli yeni belge/kural gerekiyorsa yapılandırma mesajı; sessiz bypass yok.
- [ ] Gerçek iki bağlantılı test: form açıkken policy/kural yayını; başvuru+kayıt rollback; davet yenilenmesi; aynı kullanıcının çift ilk kaydı; 0014 sonrasındaki çoklu etkinlik ayrımı.
- [ ] Commit: `Etkinliğe ilk kayıtta atomik ve ayrı koşul onayları`.

## Task 4 — Kanıt erişimi ve hesap anonimleştirme

**Değiştir:** `anonymize_user` yeni migration gövdesi, gizlilik sayfası, topluluk pano okuması. **Ekle:** kullanıcının kendi kabul geçmişi `/hesabim/onaylar`, `tests/database-policy-privacy.sql`.

- [ ] Kullanıcı kendi sürüm/tarih/scope geçmişini görebilir. Sahip yalnız kendi topluluğu adına yönetim kanıtını; organizatör diğer kullanıcıların bütün kabul geçmişini göremez. Head admin erişimi mevcut audit yaklaşımıyla sınırlı.
- [ ] Onay kanıtına token, OAuth erişim verisi, serbest kullanıcı agent metni veya IP varsayılan olarak eklenmez. Gerekli olmayan kişisel veri çoğaltılmaz.
- [ ] Mevcut `anonymize_user` akışı yeni FK'lerde takılmaz. Kişi profil/iletişim verisiyle sözleşme kanıtının saklama ihtiyacı ayrı alanlarda modellenir. Plan 3'ün `policy_subjects` eşlemesi kontrollü ayrılır; acceptance üzerindeki `subject_id` sabit kalır. User FK `ON DELETE CASCADE` ile kanıtı sessiz silmez; mevcut acceptance UPDATE yasağı anonimleştirme bahanesiyle kaldırılmaz. Süre/politika metni hukuki girdide yoksa kanıtı sonsuz saklama ya da otomatik silme varsayımı yapılmaz; yayın girdisi olarak kayda geçer.
- [ ] Arşivin 30 günlük dosya saklamasıyla sözleşme/audit saklaması karıştırılmaz. Plan 5 sözleşme kanıtını veya SHA kayıtlarını silmez.
- [ ] Commit: `Belge onay geçmişi ve anonimleştirme uyumu`.

## Task 5 — Kabul testleri ve yayın sırası

- [ ] `tests/preview.mjs`: güncel/eksik/eski onay, legacy katılımcı, iki farklı etkinlik kuralı ve form açıkken sürüm değişimi. API/HTML/RSC kişiye ait geçmişi başka oturuma sızdırmaz.
- [ ] Gerçek tarayıcıda iki checkbox, belgeyi açıp geri dönme, eski formu gönderme, iki kez tıklama, kabulden sonra güvenli dönüş. 390px/mobil ve klavye; uzun belge bağlantıları taşmaz.
- [ ] `npm run check`, build, `test:db`, routes, browser ve event-isolation; mevcut teslim deadline/rollback/stres testleri geçer. Yeni sürüm yayınlandıktan sonra mevcut yarışmacının kabul edilmiş sürümünü güncelleyebildiği özellikle sınanır.
- [ ] Yayın: önce additive `0017` ile yeni tablolar/RPC'ler ve eski kodla uyumlu kapalı enforcement; yeni uygulama; gerçek yayınlanabilir metinler ve yönlendirme provası. Ardından `0018` ile yönetim/katılımcı DB guard'ları açılır, eski kayıt/katılım girişlerinin servis rolüne execute izni kapatılır. Yeni kapsayıcılar bu eski gövdeleri definer iç yardımcı olarak çağırabilir; istemci/servis doğrudan atlayamaz. Aktivasyon öncesi yeni kapsayıcılar yine açık onay denetimi yapar. 0018 eski uygulama hâlâ yayındayken uygulanmaz.
- [ ] Genel başvuru anahtarı bu planla tek başına açılmaz; Plan 5 saklama/marka doğrulaması da kapanır. Sözleşme metni girdisi tamamlanmadan teknik test başarısı yayın onayı sayılmaz.
- [ ] Plan tamamlanma kaydı ve commit; uzak aktarım ve canlı etkinleştirme ayrıca yetkilendirilir.

## Bitiş ölçütü

Eksik güncel yönetici onayı DB'de yazmayı reddeder; arşiv işçisi çalışır. Katılımcının ilk etkinlik onayları kaydıyla birlikte atomiktir; yeni belge mevcut teslimi engellemez. Eski metin/kanıt değişmez ve kişinin kendi geçmişi okunur. Yeni topluluğun başvuru ve yönetiminde Plan 3 ile aynı kabul kayıtları kullanılır.
