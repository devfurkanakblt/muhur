# Design

## İşlem ve yenileme güvencesi

- Sunucuda değişiklik yapan her form `ActionForm` veya `useProtectedForm` üzerinden gönderilir. İlk gönderim olayında kilit alınır; React'in yeni görüntüyü çizmesi beklenmez.
- Devam eden işlemde bütün gönderim düğmeleri pasiftir, işlem adı görünür ve `aria-busy` kullanılır. Hata halinde alanlar korunur ve yeniden deneme açılır.
- Tekrar tıklama denetimi sadece normal hızda yapılmaz: aynı anda üç gönderim, yavaş yanıt, hata sonrası yeniden deneme ve işlem sürerken canlı yenileme sınanır.
- Taslak ve işlem takibi form bazındadır. Bir formun başarısı başka formun değişikliklerini temizlemez. Gönderimden sonra yapılan yeni düzenlemeler eski başarıyla kaydedilmiş sayılmaz.
- Sayaç veya canlı durum bileşeni doğrudan form korumasını atlayarak yenileme yapmaz. Devam eden işlem sırasında zorla yenileme de kapalıdır.
- İstemci kilidi, farklı sekme/yönetici isteklerini tekilleştirmez. Bildirim ve geri alınamaz işlemlerde sunucu tarafının tekrar önleme garantisi ayrıca doğrulanır.
- Ekran görüntüsü davranış kanıtı değildir. Kritik akışlar `test:live-browser` ile, mobil taşma gerçek viewport ölçümüyle kontrol edilir.

Marka: **mühür.** (küçük harf, indigo nokta). Slogan: "Süre dolar, mühür vurulur." Header, sekme başlığı şablonu (`%s · mühür`), footer, OG görseli, mühür satırları, kilit düğmesi ("Mührü vur") ve kilit başlığı ("Mühürlendi.") aynı kelimeyi taşır.

Müze vitrini. Hackathon bir sergi kurulumudur: son teslime kadar vitrin açıktır, kilit anında cam kapanır ve her proje müze etiketli bir esere dönüşür.

## Renk (tokenlar `app/globals.css` içinde)

| Token | Değer | Görev |
|---|---|---|
| `--wall` | `#eef2f6` | Sayfa zemini, soğuk galeri duvarı (maskot paftasının zemini) |
| `--plinth` | `#f8f9fb` | Logo kaidesi, form alanları |
| `--ink` | `#0b0d1e` | Metin, bölüm çizgileri (maskot konturu `#00051D` ailesi) |
| `--ink-2` / `--ink-3` | `#44485f` / `#61667d` | İkincil metin / etiket ve yardımcı metin (duvarda ≥4.5:1) |
| `--rule` / `--rule-strong` | `#d3d9e2` / `#b9c1cd` | Kıl çizgiler, alan kenarları |
| `--indigo` | `#4a36cf` | **Yalnızca** süre, kilit, cam ve birincil eylem. Başka hiçbir yerde kullanılmaz. |
| `--blush` | `#feccd7` | Maskot yanağı, kayıt sonrası "No. 007" pembe mührü ve verilmiş oy ("Oyun burada"). Kalbin rengi. |
| `--danger` | `#b4233c` | Hata metni |

## Koyu tema

Gece galerisi: `--wall #0e1020`, `--plinth #161a2e`, `--ink #e8eaf4`, `--ink-2 #aeb3c9`, `--ink-3 #8e94ad`, `--indigo #9d8fff` (metin/vurgu), `--indigo-fill #5b46e6` (düğme zemini; beyaz metinle 6:1). Sistem temasını izler; header'daki düğme seçimi `localStorage.tema` içinde saklar, `<head>` betiği ilk boyamadan önce uygular. Koyu temada maskot, paftadaki çıkartma seti gibi beyaz konturla (`drop-shadow` zinciri) zeminden ayrılır.

## Tipografi

- Schibsted Grotesk (UI ve başlıklar), JetBrains Mono (yalnızca eser numarası, SHA, repo adı, tarih alanı).
- Geri sayım rakamları Schibsted Grotesk `tnum` ile (yön sözleşmesi mono diyordu; büyük boyutta mono rakamlar müze duvar yazısı yerine terminal kostümü gibi okunduğu için grotesk + tabular rakam seçildi). İki nokta indigo. Ekran başlığı en fazla 6rem.
- Alan adları (sayaç birimleri, mühür kaydı etiketleri, tablo başlıkları) müze etiketi gibi küçük, aralıklı büyük harf: `0.6875rem`, `0.1em`.
- Eser numarası etiketin altında, repo bağlantısıyla aynı satırda (müze etiketindeki envanter numarası gibi).
- Başlık üstü etiket (eyebrow) yok. Gövde metni en fazla ~60ch.

## Biçim

- Köşe: her şey 2px (müze etiketi keskinliği). Kart yok, gölge yok; gruplama kıl çizgi ve boşlukla.
- Eser: aynı ölçekte kare kaide (logo %46) + altında etiket (No., ad, ekip, özet, repo, mühür). Dar ekranda kaide 104px solda.
- Bölüm başı: 1px `--ink` üst çizgi, başlık solda, sayım ve durum sağda.

## Hareket

- Tek imza hareket: kilitte vitrin camı soldan kayarak kapanır (1400ms, `cubic-bezier(0.77,0,0.175,1)`), ardından "Mühürleniyor…" satırları belirir.
- Basılabilir her şey `scale(0.97)`. "Şimdi kilitle" 2 sn basılı tutulur (clip-path linear dolum, 200ms geri sarma).
- Maskot vitrin açıkken hafifçe nefes alır; ifade geçişleri 240ms opaklık + blur.
- `prefers-reduced-motion`: konum hareketleri kapanır, yalnızca opaklık kalır.

## Maskot

`components/mascot/` — gövde, paftadaki ana karakterden vektörleştirildi (`paths.ts`). İfadeler: `normal`, `mutlu`, `merakli`, `odakli`, `uykulu`, `heyecanli`, `hackathon`, `pizza`, `kahve`, `kalp` (halkın seçimi). Ana sayfa maskotuna tıklayınca birkaç saniyeliğine ifade değiştirir. Ana sayfa maskotu Türkiye saatine göre değişir (`lib/daypart.ts`): 01–07 uykulu, 07–10 kahve, 10–12 hackathon, 12–14 pizza, 14–19 hackathon, 19–21 pizza, 21–01 odaklı (gözlüklü). Son 10 dakika heyecanlı ve kilit sonrası uykulu ifadesi saatin önüne geçer. Selamlama başlığı aynı dilimlerden seçilir; giriş yapan kullanıcıya bazen GitHub adıyla seslenir ve bir saat boyunca aynı kalır. Diğer sayfalar: boş vitrin/404 → meraklı, kayıt sonrası → mutlu.

## Logo

`public/brand/muhur-logo.svg` (+ 512/1024 PNG): indigo `#4A36CF` kare, beyaz küçük harf "m" (Schibsted Grotesk 600 çiziminden vektöre çevrildi) ve maskot yanağından pembe `#FECCD7` nokta, mühür kenarı gibi ince iç çerçeve. Favicon (`app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png`) aynı işaretin çerçevesiz hali; 16px'te okunur kalır. Maskot site içinde karakter, logo ise küçük boyutların işaretidir.

## Yüzeyler

- **Sahne modu** (`/sahne`): projektör ölçeği; geri sayım gün/saat sayısına göre boyutlanır, son 60 saniyede yalnızca indigo saniyeler kalır, kilitte cam tüm sahneyi kaplar. Alt şerit: duyuru ya da son push akışı.
- **Duyuru şeridi**: sayfaların üstünde `--indigo-fill` zeminli tek satır; kapatılabilir, yeni duyuru yeniden görünür.
- **Eser sayfası, makbuz, doğrulama, aydınlatma metni**: aynı müze etiketi dili; alan adları küçük aralıklı büyük harf, değerler mono. Makbuz yazdırmada header/footer gizlenir.
- **Canlı nabız**: etiketin altında nötr (`--ink-3`) yavaş atan nokta; yalnızca etkinlik başladıktan sonraki push'lar.
- **Ctrl/Cmd+S**: "Kaydetmene gerek yok, push etmen yeterli." bildirimi (200 ms giriş, 150 ms çıkış).
- **Ctrl/Cmd+Shift+S (gizem avcısı)**: açılış videosundaki "sha256" satırı gizli bir hex mesajdır; çözen bu kısayolla açılan pencereye cümleyi yazar. Cevap sunucuda denetlenir, yalnızca hackathon saatlerinde kaydedilir. Ekipten biri bulursa panelin Rozet bölümünde yeşil "mühür. | gizem avcısı" rozeti açılır; yönetimde "Gizem avcıları" listesi görünür.
