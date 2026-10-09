import type { MascotMood } from "@/components/mascot/mascot";

/** Türkiye saati (UTC+3, yaz saati yok). */
export function istanbulHour(ms: number) {
  return new Date(ms + 3 * 3600 * 1000).getUTCHours();
}

export type Daypart = "gece" | "sabah" | "mesai" | "ogle" | "ikindi" | "aksam" | "gece-vardiyasi";

export function daypart(ms: number): Daypart {
  const h = istanbulHour(ms);
  if (h >= 1 && h < 7) return "gece";
  if (h < 10 && h >= 7) return "sabah";
  if (h < 12 && h >= 10) return "mesai";
  if (h < 14 && h >= 12) return "ogle";
  if (h < 19 && h >= 14) return "ikindi";
  if (h < 21 && h >= 19) return "aksam";
  return "gece-vardiyasi";
}

const MOOD: Record<Daypart, MascotMood> = {
  gece: "uykulu",
  sabah: "kahve",
  mesai: "hackathon",
  ogle: "pizza",
  ikindi: "hackathon",
  aksam: "pizza",
  "gece-vardiyasi": "odakli",
};

export function moodAt(ms: number): MascotMood {
  return MOOD[daypart(ms)];
}

// {ad} olan satırlar yalnızca giriş yapmış kullanıcıya gösterilir.
const GREETINGS: Record<Daypart, string[]> = {
  gece: [
    "Selam, gece kuşu.",
    "Hâlâ ayakta mısın, {ad}?",
    "Uyku da bir commit'tir, {ad}.",
    "Saat geç, kod taze.",
  ],
  sabah: [
    "Günaydın, erkenci.",
    "Kahveni aldın mı, {ad}?",
    "İlk commit kahveden sonra.",
    "Günaydın {ad}, terminal ısındı mı?",
  ],
  mesai: [
    "Kolay gelsin, {ad}.",
    "Klavye ısındı mı?",
    "Sabah mesaisi, temiz diff.",
  ],
  ogle: [
    "Henüz acıkmadın mı, {ad}?",
    "Önce pizza, sonra deploy.",
    "Öğle arası. Merge conflict bekleyebilir.",
    "Bir dilim de sana ayırdık, {ad}.",
  ],
  ikindi: [
    "Hadi bakalım, {ad}.",
    "Öğleden sonra mesaisi. Build yeşil kalsın.",
    "Bir push daha, {ad}?",
    "Tok karnına refactor.",
  ],
  aksam: [
    "Akşam yemeği deploy'dan önce gelir.",
    "Karnın tok mu, {ad}?",
    "Mola ver, bug kaçmaz.",
  ],
  "gece-vardiyasi": [
    "İyi akşamlar, {ad}.",
    "Gece vardiyası başladı.",
    "Gözlükler takıldı, {ad}.",
    "Karanlık tema saati.",
  ],
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const LOCKED = ["Mühür vuruldu.", "Mühür vuruldu. İyi uykular, {ad}.", "Kalemler bırakıldı.", "Vitrin kapandı, {ad}. Emeğine sağlık."];
const FINAL = ["Son dakikalar, {ad}!", "Son push'lar, son dakikalar.", "Kaydet, commit'le, push'la.", "Saat işliyor, {ad}."];

export type Phase = "baslamadi" | "acik" | "son-dakika" | "kilitli";

const BEFORE = ["Isınma turları.", "Az kaldı, {ad}. Fikir hazır mı?", "Takımını topla, {ad}.", "Klavyeler hazır mı?"];

/** Aynı saat içinde aynı kişiye aynı selam; saat değişince yenisi. Kilit ve son dakikalar saatin önüne geçer. */
export function greetingAt(ms: number, login: string | null, phase: Phase = "acik") {
  // Gece yarısına bir dakika kala herkese aynı selam.
  const t = new Date(ms + 3 * 3600 * 1000);
  if (phase === "acik" && t.getUTCHours() === 23 && t.getUTCMinutes() === 59) return login ? `Yarın oldu sayılır, ${login}.` : "Yarın oldu sayılır.";
  const source = phase === "kilitli" ? LOCKED : phase === "son-dakika" ? FINAL : phase === "baslamadi" ? BEFORE : GREETINGS[daypart(ms)];
  const pool = source.filter((g) => login || !g.includes("{ad}"));
  const hourKey = Math.floor(ms / 3_600_000);
  const line = pool[hash(`${phase}:${hourKey}:${login ?? ""}`) % pool.length];
  return login ? line.replace("{ad}", login) : line;
}
