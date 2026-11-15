# Platform belgeleri

Bu klasör hukuki incelemesi tamamlanmış sözleşme metinlerinin yerel kaynağıdır. **Buradaki dosyalar kendiliğinden yayınlanmaz.**

| Tür | Adres | Kim onaylar |
|---|---|---|
| `platform` | `/kosullar/platform/<sürüm>` | Topluluk sahibi/organizatörü, topluluk adına |
| `data_processing` | `/kosullar/veri-isleme/<sürüm>` | Topluluk sahibi/organizatörü, topluluk adına |
| `participant` | `/kosullar/katilimci/<sürüm>` | Katılımcı, etkinliğe ilk kaydında (etkinlik kurallarından ayrı) |

## Akış

1. Metni düz UTF-8 olarak kaydet (ör. `content/policies/platform-2026-12.txt`).
2. Önizle: `npm run policy -- preview platform 2026-12 content/policies/platform-2026-12.txt`
   Metin NFC + LF olarak normalleştirilir; SHA-256 bu normalleştirilmiş metnin UTF-8 baytlarından hesaplanır ve belge sayfasında görünür.
3. Taslak yükle: `npm run policy -- draft platform 2026-12 <dosya> --actor <head admin UUID>`
   Aynı sürümün taslağı yayınlanana kadar yeniden yüklenebilir.
4. `/yonetim/belgeler` sayfasında taslağı oku; son 12 saatte açılmış oturumla gerekçe yazarak yayınla.

## Kurallar

- Yayınlanan sürüm değiştirilemez, silinemez. Düzeltme yeni sürümdür; eski adres ve eski kabuller kalır.
- Yeni platform/veri işleme sürümü, yöneticilerden bir sonraki yönetim işleminden önce yeniden onay ister (0018 sonrası DB'de zorunlu).
- Yeni katılımcı sürümü mevcut etkinlik kayıtlarını ve teslimleri etkilemez; sonraki etkinlik kaydında istenir.
- Örnek/taslak metin gerçek sözleşmeymiş gibi yayınlanmaz. Teknik testlerin geçmesi metin onayı yerine geçmez.
- `0018_sozlesme_zorunlulugu.sql` üç tür de yayınlanmadan uygulanamaz.
