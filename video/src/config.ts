// Videoda sonradan değişecek her bilgi burada. Değiştir, `npm run render` ile yeniden üret.

export const config = {
  /** Maskotun adı kesinleşince yaz (ör. "Nöro"). null iken S1 "Adım mı? …Henüz yok." der. */
  mascotName: null as string | null,

  event: {
    name: "EkoZeka 2026",
    dates: "6 Kasım 20:00 → 7 Kasım 20:00",
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
   * Sponsor logoları (video/public/sponsorlar/ altındaki dosya adları). Boşken S22'de sponsor alanı çıkmaz.
   */
  sponsors: [] as string[],

  /** Müzik dosyası (video/public/muzik/ altında, ör. "acilis.mp3"). null iken video yalnızca efektlerle çalar. */
  music: null as string | null,
  musicVolume: 0.35,
  sfxVolume: 0.9,
};
