# EkoZeka 2026 · açılış videosu

Açılış dev ekranı için 16:9, 1920×1080, 30 fps tanıtım videosu. Seslendirme yok; maskot konuşma balonlarıyla anlatır. Remotion (React) ile kodla üretilir. Maskot gövdesi sitedeki vektörden gelir (`../components/mascot/paths.ts`).

Bu klasör sitenin derlemesine dahil değildir (kök `tsconfig`, ESLint ve `.vercelignore` dışında tutulur), kendi bağımlılıkları vardır.

## Kullanım

```bash
cd video
npm install
npm run studio   # tarayıcıda önizleme; her sahne "Sahneler" klasöründe ayrıca açılır
npm run render   # out/ekozeka-acilis.mp4
npm run render:reels  # out/ekozeka-reels.mp4 + out/ekozeka-reels-kapak.png (Instagram, 9:16)
npm run stills   # stills/ altına kontrol kareleri
npm run sfx      # ses efektlerini yeniden sentezler (Python, numpy, scipy)
```

İlk render, Remotion'ın Chrome Headless Shell'ini indirir. Yazı tipleri (Schibsted Grotesk, JetBrains Mono) render sırasında Google Fonts'tan yüklenir; internet gerekir.

## Sonradan değişecek bilgiler

Hepsi `src/config.ts` içinde. Değiştirip `npm run render`:

| Alan | Ne yapar |
|---|---|
| `mascotName` | Ad kesinleşince S1'de "Adım ___!" der. `null` iken "Adım mı? …Henüz yok." |
| `program` | Saat ve etkinlik listesi. Dolunca S9 program sahnesi videoya girer. |
| `logos` | `public/logolar/` altındaki şeffaf PNG logolar ve yükseklikleri. S22 ve Reels'in son sahnesinde (R6) görünür. |
| `music` | `public/muzik/` altındaki parça. Başta ve sonda yumuşak geçişle çalar. |
| `event` | Ad, ay, `start`/`end` (gün, gün adı, saat) ve yer. Tarih satırı, Reels takvim kartları ve S18'deki saat/makbuz bunlardan üretilir. |
| `telegramUrl`, `siteUrl` | QR kodlar bunlardan üretilir. |

Sahne süreleri `src/Video.tsx` içindeki `SCENES` listesinde (kare cinsinden).

## Instagram Reels

`EkoZekaReels` kompozisyonu: 1080×1920, ~31 sn, kayıt duyurusu (sahneler `src/reels/`, süreler `REELS` listesinde). Müzik gömülü değil, yalnızca efektler var; müziği Instagram'da ekle. Yazılar Instagram arayüzünün örttüğü üst ~250 px ve alt ~450 px bandın dışında tutulur. Kapak için `out/ekozeka-reels-kapak.png` kullanılabilir (Kapak → Film rulosundan ekle). Render `--color-space bt709` ile yapılır; Instagram standart `yuv420p` bekler.

## Notlar

- Arayüz sahnelerindeki ekip, repo, SHA ve eserler örnektir ve ekranda "ÖRNEK" etiketi taşır.
- S3'teki küre `d3-geo` ile çizilir; kıta verisi Natural Earth 1:50m (`world-atlas` paketi, kamu malı). Pencerelerdeki çizimler `src/components/vignettes.tsx` içindedir.
- Ses efektleri kayıt değil, `scripts/sfx.py` ile sentezlenir; telif sorunu yoktur.
- Remotion lisansı bireyler, kâr amacı gütmeyen kuruluşlar ve en fazla 3 çalışanlı şirketler için ücretsizdir; öğrenci kulübü kullanımı bu kapsamdadır.
