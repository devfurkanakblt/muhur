// Videoda sonradan değişecek her bilgi burada. Değiştir, `npm run render` ile yeniden üret.

export const config = {
  /** Maskotun adı kesinleşince yaz (ör. "Nöro"). null iken S1 "Adım mı? …Henüz yok." der. */
  mascotName: null as string | null,

  event: {
    name: "EkoZeka 2026",
    month: "Kasım",
    /** Başlangıç ve bitiş. Tarih satırı, Reels takvim kartları ve S18'deki saat/makbuz bunlardan üretilir. */
    start: { day: 7, weekday: "Cumartesi", time: "09:00" },
    end: { day: 8, weekday: "Pazar", time: "09:00" },
    place: "DEÜ Tınaztepe · Depark",
  },

  siteUrl: "muhur-phi.vercel.app",
  telegramUrl: "https://t.me/+S5QwXMbhDqBjMDhk",

  /**
   * S9 program sahnesi. null iken sahne videoda yer almaz.
   * Kesinleşince ör. [{ time: "21:00", text: "Mentor turu" }, { time: "00:00", text: "Gece pizzası" }]
   */
  program: null as { time: string; text: string }[] | null,

  /**
   * Bitiş logoları (video/public/logolar/ altındaki şeffaf PNG'ler). S22 ve R6'nın altında sırayla çıkar; boşken alan hiç çıkmaz.
   * `h`: 1920×1080'de logonun yüksekliği (px). Yuvarlak/kare logolar uzun yataylardan daha yüksek tutulur ki göze eşit dursunlar.
   */
  logos: [
    { file: "gsb.png", name: "Gençlik ve Spor Bakanlığı", h: 128 },
    { file: "unides.png", name: "ÜNİDES", h: 92 },
    { file: "depark.png", name: "Depark", h: 66 },
    { file: "csai.png", name: "DEÜ CS&AI", h: 128 },
  ] as { file: string; name: string; h: number }[],

  /** Müzik dosyası (video/public/muzik/ altında, ör. "acilis.mp3"). null iken video yalnızca efektlerle çalar. */
  music: "electrodoodle-acilis.mp3" as string | null,
  musicVolume: 0.35,
  sfxVolume: 0.9,
};

const { month, start, end } = config.event;

/** "7 Kasım 09:00 → 8 Kasım 09:00" */
export const eventDates = `${start.day} ${month} ${start.time} → ${end.day} ${month} ${end.time}`;

/** "09:00" → "08:59": S18'de teslim saatinden önceki son dakika. */
export function minuteBefore(time: string) {
  const [h, m] = time.split(":").map(Number);
  const t = (h * 60 + m + 1439) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
