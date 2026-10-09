# İnceleme raporu · arayüz işleri

Kapsam: A16, ilgili ekran akışları ve yerel tarayıcı kontrolleri. A01/A02 ve kullanıcının ayırdığı sunucu/veritabanı işleri bu çalışmanın kapsamı dışında. Ortak çalışma alanında sunucu uç noktaları güncellendiğinde arayüz mevcut sözleşmeye bağlandı; ilgili backend düzeltmelerinin tamamlandığı bu belgede iddia edilmiyor.

## Uygulananlar

- Form başına değişiklik ve gönderim takibi. Bir formun kaydı diğerini temizlemez; gönderim sürerken yazılan yeni değişiklikler korunur.
- Proje, duyuru, zamanlama, ödül, yeni etkinlik ve kuruculuk formlarında hata sonucu girdiler korunur. Form bazlı geri alma/vazgeçme vardır.
- Sayaç dahil otomatik yenilemeler ortak koordinatörden geçer. Açık taslak veya devam eden işlem yenilemeyi bekletir. Kullanıcı yenilemeden önce sonuçlarını görür ve vazgeçebilir.
- Sunucu zamanının sürüm değişmese de yeniden eşitlenmesi; monoton saat ve yaklaşık yarım istek süresiyle ağ gecikmesi telafisi. İlk durum isteği hidrasyon sonrasında gecikmiş ilk referansı düzeltir.
- Güncel tekil eser ekranında canlı yenileme. Geçmiş sergiler canlı etkinliğin değişimleriyle yenilenmez.
- Bağlantı kesildiğinde eski verinin gösterilebileceği açıklanır; bağlantı dönünce hemen tekrar kontrol edilir. Sahne de bağlantı durumunu gösterir.
- Kabul edilen SHA ile kontrol edilmiş repo HEAD'i açık karşılaştırılır; kontrol zamanı ve eski kontrol uyarısı görünür.
- Güncellenen arşiv uç noktasına kabul edilmiş sürümü indirme bağlantısı ve SHA-256 gösterimi eklendi.
- Jüri paketinde `paket=gecerli` ve `paket=eksiksiz` ayrı bağlantılar ve açıklamalarla sunulur.
- Doğrulamada tam/kısa kod sınırları ve commit eşleşmesinin dosya bütünlüğü anlamına gelmediği açıklanır; hata ve tekrar deneme akışı korunur.
- Genel hata ekranı kayıt yokluğu iddia etmez; yeniden deneme ve destek hata kodu sunar.
- Yönetim tablosundaki bozuk metin UTF-8 olarak düzeltildi: “Diğer sütunları görmek için tabloyu sağa kaydır.”

## Tekrar tıklama kontrolü

İlk gönderim olayında eşzamanlı bir kilit alınır. React'in `disabled` durumunu çizmesi beklenmez. Aynı formdan devam eden isteğe ek gönderim engellenir; sonuçta kilit bırakılır. Butonlar işlem adıyla bekleme durumunu gösterir. Devam eden işlem sırasında otomatik yenileme ve zorla yenileme de bekletilir.

Kontrol edilen değiştirici işlemler:

| Alan | İşlemler |
| --- | --- |
| Yönetim | Oylamayı aç/kapat-sonuç açıkla, zamanlama, duyuru, ödül ekle/kaldır, yeni etkinlik, kuyruk çalıştırma, iş/mühür tekrar denemesi |
| Katılımcı | Proje kaydı/düzenleme, teslim güncelleme, kuruculuk devri, projeyi geri çekme, ekipten ayrılma, üye çıkarma, davet yenileme, repo sağlık kontrolü |
| Oturum ve oy | GitHub giriş, çıkış, davetle katılım, oy verme/geri alma |
| Diğer | Mühür doğrulamasında dosya/kod sorguları; basılı tutarak kilitte tek zamanlayıcı ve tek devam eden işlem |

Kopyalama, tema, maskot, yazdırma ve duyuruyu kapatma sunucuda değiştirici işlem başlatmaz. İndirme bağlantıları mutasyon formu değildir.

Birden çok sekme/yönetici veya doğrudan HTTP isteğinde bildirimlerin tekilleştirilmesi istemci kilidinin garantisi değildir; sunucu tarafındaki tekrar önleme ve işlem sonucu sözleşmesi ayrı doğrulanmalıdır. Özellikle `void` dönen aksiyonun sessizce başarısızlığı istemcide başarıdan ayırt edilemez.

## Doğrulama

- `npm run check`: form/revizyon/monoton saat regresyonları ve mevcut uygulama kontrolleri.
- `npm run test:browser`: gerçek CDP viewport ile masaüstü/mobil taşma denetimi ve ekran görüntüleri. Windows Chrome fiziksel pencere minimumu artık mobil viewport sanılmıyor.
- `npm run test:live-browser`: iki form, geri alma, yenileme onayından vazgeçme, offline/online, kilitte taslak, aksiyon hatası ve yavaş işlemde aynı formun dört gönderim denemesi.
- `npm run test:routes`: yerel örnek verilerle HTTP/içerik ve erişim kontrolleri.

Tamamlanan tarayıcı etkileşim koşumunda iki formun korunması, tek form geri alma, yenilemeden vazgeçme, offline/online, kilitte taslak, gerçek aksiyon hata yanıtında girdilerin korunması ve sonuç açıklama işleminde dört gönderim denemesinin tek isteğe düşmesi geçti. Sekiz masaüstü/mobil ekran yatay taşma kontrolünden geçti. Bunlar gerçek üretim hesabı ve Telegram yayını testi değildir.

Tarayıcı testleri yerel sahte veriler kullanır; üretim hesabı, gerçek DB yazması veya Telegram bildirimi kullanılmaz. Kilit RPC'si testte taklit edilir; diğer değiştirici işlemler reddedilir. Kısıtlı ortamda yalnızca test tarayıcısına `BROWSER_TEST_NO_SANDBOX=1` verilebilir. Next.js'in debug WebSocket'i bu ortamda kurulamadığından React debug kanalı yalnızca `MUHUR_TEST_PREVIEW=1` için kapatıldı; normal proje ayarı korunur.

Gerçek telefon/projektör, oturumun gerçekten sona ermesi, yeni etkinliğe geçiş ve deadline yük testi ayrıca yapılmalı. Google Fonts erişimi test ortamında kesildiğinde yedek yazı tipi kullanılır; bu nedenle görsel kontroller marka fontunu onaylamaz. `npm audit --omit=dev` registry erişim hatasıyla tamamlanamadı; bağımlılıkların açık içermediği sonucu çıkarılamaz.
