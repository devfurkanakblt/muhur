# Çoklu topluluk · Plan 3–5 uygulama sırası

13 Kasım 2026 · Plan 3 kodu yerelde uygulandı/doğrulandı; Plan 4–5 ayrıntılı plan olarak bekliyor. Canlı yayın yapılmadı.

## Planlar

| Plan | Dosya | Teslim |
|---|---|---|
| 3 | [Başvuru, davet, LinkedIn ve Brevo](2026-11-13-coklu-topluluk-3-basvuru-davet-ve-brevo.md) | Topluluk başvurusu/onayı, topluluk panosu, üyelik/sahiplik, jüri alanı, sağlayıcı kimlikleri, işlemsel e-posta |
| 4 | [Sözleşme sürümleri ve onay](2026-11-13-coklu-topluluk-4-sozlesme-surumleri-ve-onay.md) | Değişmez belge sürümleri, yönetici yeniden onayı, katılımcının ilk kaydında iki ayrı kabul |
| 5 | [Marka, özellikler ve saklama](2026-11-13-coklu-topluluk-5-marka-ozellikler-ve-saklama.md) | Topluluk logosu/rengi, DEÜ maskot ayrımı, etkinlik özellikleri, 30 günlük ZIP yaşam döngüsü |

## Kullanıcı kararları ve teknik öneriler

- **Yeni kullanıcı kararı:** e-posta sağlayıcısı Brevo (13 Kasım). Resend veya başka servis bu planın varsayılanı değildir.
- Önceki tasarımın kararları korunur: GitHub katılımcı girişi, GitHub/LinkedIn jürisi, kapsamlı yetki, topluluk onayı, organizatör/jürinin kendi etkinliğinde yarışamaması, 30 gün saklama, mühür kanıtının korunması.
- URL'ler, yedi günlük davet, kotalar, migration adları, renk kontrast uygulaması ve kuyruk durumları teknik uygulama önerileridir. Bunlar kullanıcı tarafından ayrıca seçilmiş ürün kararı gibi sunulmaz.
- Jüri puanlama/rubrik, ödeme, başvuru formu oluşturucu, başka topluluklar için Telegram bot yönetimi kapsam dışıdır.

## Kod tabanı ve yayın ön koşulu

Plan 2 yerelde tamamlandı: `3f17ee1`, `2ccd431`; son bilinen dal `feat/coklu-topluluk-2`. Uzak depoya gönderim önceki turda otomatik onay denetimine takıldı; bu planlama turu push izni veya canlı yayın sayılmaz. Yeni bir uygulama çalışmasında dal/main/canlı migration durumu yeniden doğrulanır. Bu planlar mevcut çalışma ağacına yazıldı; uygulama kodu değiştirilmedi.

## Bağımlılık sırası

1. Plan 2'nin kod ve `0013 → yayın → 0014` geçişi kapanır.
2. Plan 3 ortak belge/özne/onay temelini kurar; başvuru/karar e-postaları için outbox şeması da ilk migration'da vardır. Sonra davet/roller, Brevo işçisi ve ekranlar tamamlanır. Genel topluluk başvurusu kapalı kalır.
3. Plan 4 aynı sözleşme tablolarına yayınlama ve zorunlu sürüm denetimini bağlar. Mevcut yarışmacının yeni teslimini engellemez.
4. Plan 5 marka/özellik katmanını ve saklama okuyucularını tamamlar. Süreli silme önce kapalı olarak kurulur; gerçek manifest raporu ve ayrı açık onaydan sonra aktive edilir.
5. Brevo/LinkedIn dış servis provası, yayınlanabilir belge girdileri ve marka/saklama doğrulaması birlikte kapanınca genel başvuru sunucu anahtarı açılır.

Bu sıra geliştirmeyi parça parça ilerletir; eksik sözleşme veya saklama davranışıyla yeni topluluklara açılmayı önler. Mevcut DEÜ etkinlikleri bu sırada çalışır.

## Önerilen migration haritası

| Numara | Kapsam | Aktivasyon |
|---|---|---|
| 0015 | Başvurular, policy temel tabloları ve mail_outbox temeli | Additive; eski kod uyumu |
| 0016 | Davetler/üyelik RPC'leri, mail olayları, etkinlik bağlantıları | Plan 3 uygulama yayınıyla; gerekiyorsa rol grant geçişi aynı hazırlık/aktivasyon düzeninde ayrılır |
| 0017 | Belge sürümleri, kural sürümleri ve enrollment hazırlığı | Additive; zorunlu denetim henüz kapalı |
| 0018 | Sözleşme guard'ları ve eski kayıt girişlerinin daraltılması | Plan 4 uygulaması yayınlandıktan sonra |
| 0019 | Marka/özellikler ve görünüm snapshot'u | Varsayılanlar eski DEÜ davranışını korur |
| 0020 | Saklama manifesti/ledger ve okuyucu altyapısı | Silme kapalı |
| 0021 | Süreli silme için aktivasyon kapısı | Okuyucu yayını ve açık aktivasyon onayından sonra; migration tek başına dosya silmez |

0015 ve 0016 Plan 3 kapsamında oluşturuldu ve izole PostgreSQL üzerinde doğrulandı; 0017–0021 henüz öneridir. Gerçek numaralar uygulama anında çakışma açısından kontrol edilir. Geriye uyumsuz grant/enforcement geçişi eski uygulama yayındayken yapılmaz; yeni aktivasyon migration'ı gerekirse sonraki öneri numaraları birlikte güncellenir.

## Test ve teslim yaklaşımı

Her task dosyaları, SQL/TypeScript arayüzleri, checkbox'lı adımlar ve commit sınırı içerir. İzole SQL testleri; iki bağlantılı kayıt/rol/onay yarışları; sahte Brevo ile hata/tekrar; rota ve gerçek form testleri; 390px/masaüstü görsel kontrol; Storage/DB sınırında kesinti testleri birlikte kullanılır. Yalnızca UI butonunun gizlenmesi yetki veya özellik denetimi sayılmaz.

Plan 3 uygulama kaydı ve test kanıtları ilgili plan dosyasında tamamlandı; canlı servis/yayın provası açık kalır. Plan 4–5 task'ları henüz tamamlanmadı. Uzak kod aktarımı, gerçek alıcıya e-posta ve canlı arşiv silme bu belgelerin yazılmasıyla yapılmış/izin verilmiş sayılmaz.


## Güncel yerel durum

`feat/topluluk-basvuru`: plan belgeleri `f27573a`, uygulama/testler `cbde216`. Plan 3'ün 101 test, üretim derlemesi, SQL/rol yarışları, HTTP ve tarayıcı kontrolleri geçti. Genel başvuru kapalı. Gerçek Supabase migration geçmişi, Plan 2 yayını ve Brevo/LinkedIn dış servis provası canlı yayın önkoşulu olarak durur. Bu tur uzak depoya gönderim veya canlı veri yazımı yapılmadı.

## Plan 4 yerel durumu (15 Kasım 2026)

`feat/sozlesme-surumleri`: 0017/0018, uygulama, birim/rota testleri yazıldı; `npm run check` ve `next build` geçti. SQL ve iki bağlantılı yarış testleri yazıldı ancak bu makinede PostgreSQL bulunmadığı için çalıştırılmadı. Commit, uzak aktarım ve canlı migration yapılmadı. Ayrıntı Plan 4 dosyasının uygulama kaydında.

## Plan 5 yerel durumu (16 Kasım 2026)

`feat/sozlesme-surumleri` üzerinde Plan 5 Task 1–6 commit'lendi; 0019–0021, uygulama ve testler yazıldı. 0017/0018'deki eksik `legacy` değeri düzeltildi. SQL testleri PGlite ile, rota/tarayıcı testleri sahte Supabase ile geçti; gerçek PostgreSQL ile yarış testleri ve canlı prova açık. Uzak aktarım, canlı migration ve canlı arşiv silme yapılmadı. Ayrıntı Plan 5 dosyasının uygulama kaydında.
