# mühür · ekran ve kullanıcı deneyimi incelemesi

Ölçüt: uykusuz ve zaman baskısı altındaki katılımcı, tesliminin durumunu ve sıradaki adımını yardım almadan anlayabilmeli. Mevcut Schibsted Grotesk, müze etiketi, indigo teslim vurgusu, pembe mühür ve maskot dili korunur.

## Yedi soruya yanıt

| Soru | İnceleme sonucu ve uygulanan değişiklik |
| --- | --- |
| Her ekran anlaşılır mı? | En kritik belirsizlik kayıt ile kod tesliminin ayrımıydı. Teslim paneli ayrı bir vurgulu yüzey, son tarih ve açık durum başlığı taşıyor. Ctrl+S artık gerçek teslim adımını anlatıyor. |
| Her ekran imzamızı taşıyor mu? | Ortak marka, tipografi ve tema korunuyor. Makbuz kendi marka/maskot başlığını, sahne büyük mühür işaretini kullanıyor. |
| Tasarım dili uyumlu mu? | Ortak renk tokenları ve keskin müze etiketi dili mevcut. Odak halkaları, bölüm açıcıları ve mobil alan boyutları ortak CSS üzerinden tutarlı hale getirildi. |
| Kullanıcı ne yapacağını anlayabilir mi? | Repo düğmesi “Repo seç”, kayıt düğmesi “Projeyi kaydet ve vitrine yerleştir” oldu. Teslim sorunu veya eksik sürümde hazırlık listesi açık. Kilit sonrasında ana sayfadan panele erişim sürüyor. |
| Zor erişilen veya gözden kaçan bileşen var mı? | Mobilde gizli Vitrin/Projem bağlantıları görünür. Panelde teslim, bilgiler ve ekip/davet için bölüm bağlantıları var. Ekip bölümü rozetin önüne alındı. Demo bağlantısı düzenlemede doluysa açık. Makbuzda esere dönüş ve doğrulama bağlantıları eklendi. |
| Kullanıcının istemeyeceği bileşen var mı? | Yanlış güven veren Ctrl+S mesajı düzeltildi. Repo aramasının otomatik odaklanıp mobil klavyeyi açması kaldırıldı. İsteğe bağlı demo/rozet gibi özellikler korunuyor; kullanım verisi olmadan gereksiz oldukları varsayılmadı. |
| Hackathon koşullarında rahatça kullanılabilir mi? | Risk azaltıldı: teslim görünürlüğü, büyük dokunma alanları, 16px mobil girdiler, odak halkaları, klavye ile içeriğe atlama, uzun başlıkların taşmasını önleme. Stres altında gerçek kullanıcı denemesi yapılmadığı için kesin onay verilmedi. |

## Ekran kapsamı

- Ana sayfa: kilit sonrasında panel erişimi, anlaşılır teslim metni, mobil gezinme.
- Panel: başlık, bölüm bağlantıları, son tarih, teslim vurgusu, hazırlık listesi, ekip/davet önceliği, açık demo düzenlemesi.
- Repo seçimi/kayıt: açık düğme adları, tam repo adı, zorunlu logo etiketi, boş bağlantı gönderimini önleme.
- Sergiler/geçmiş sergi/eser: ortak gezinme, uzun başlık koruması, içeriğe atlama. Mevcut eser/mühür hiyerarşisi korundu.
- Davet: ortak gezinme ve içeriğe atlama; giriş, mevcut ekip ve kapalı teslim durumları incelendi.
- Makbuz: esere dönme ve mührü doğrulama; yazdırmada gezinme gizli.
- Doğrulama: dosya/bağlantı hatasında yeniden deneme mesajı, aynı dosyayı yeniden seçme, boş sorguyu engelleme, dosya alanında klavye odağı.
- Yönetim: yatay tablonun kaydırılabilirliği anlatılıyor ve klavye ile erişiliyor.
- Sahne: vitrini açan görünür dönüş bağlantısı; projektör ölçeği korundu.
- Aydınlatma ve 404: ortak odak, başlık ve içeriğe atlama davranışları.

## Doğrulama ve sınırlar

27 mevcut birim testi başarılı. Lint ve TypeScript kontrolü başarılı. Yerel örnek verilerle açık/mühürlü/hatalı panel, ana sayfa, yönetim, sahne ve eser HTTP/içerik kontrolleri çalıştırıldı. Eski sahne testinin API QR beklentisi mevcut SVG karekoduna göre düzeltildi.

Tarayıcı ekran görüntüsü kontrolünde Chrome ve Edge ortam kaynaklı zaman aşımına uğradı. Görsel doğrulama ve gerçek stres altındaki kullanım henüz kesin olarak doğrulanmış sayılmaz. Kimlik doğrulama ve dış hizmetlere yazma işlemleri gerçek hesaplarla denenmedi; örnek veri kullanıldı.

Sonraki kullanıcı denemesinde katılımcıya açıklama vermeden şu işleri yaptır: repo seçip kaydetmek, yeni push sonrası teslimi güncellemek, kabul edilmiş sürümü bulmak, ekip arkadaşını davet etmek, hata sonrası önceki teslimin korunduğunu anlamak, kilit sonrası makbuzu açmak. İlk tıklama, yanlış işlem, yardım isteme ve tamamlanma süresini kaydet.
