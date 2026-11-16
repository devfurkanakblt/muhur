// Etkinlik rengi: saf ve bağımlılıksız; sunucu, istemci önizlemesi ve testler aynı kararları verir.
// SQL tarafı (0019 brand_color_readable) açık tema çiftlerini aynı formülle denetler.

/** Platformun kendi indigo tonu: etkinlik rengi seçilmemişse kullanılır. */
export const DEFAULT_ACCENT = "#4a36cf";

/** globals.css ile aynı tema tokenları; yalnız kontrast hesaplarında kullanılır. */
export const THEME = {
  light: { wall: "#eef2f6", plinth: "#f8f9fb", ink: "#0b0d1e" },
  dark: { wall: "#0e1020", plinth: "#161a2e", ink: "#e8eaf4", fillInk: "#0b0d1e" },
} as const;

/** Metin için 4.5:1 (küçük metinde büyük yazı istisnası yok), kontrol/odak göstergesi için 3:1. */
export const TEXT_CONTRAST = 4.5;
export const UI_CONTRAST = 3;

const HEX6 = /^#[0-9a-f]{6}$/;

/** "#ABC", "abc", "#AABBCC" → "#aabbcc". Başka her şey (CSS, URL, isimli renk) null. */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let v = input.trim().toLowerCase();
  if (!v.startsWith("#")) v = `#${v}`;
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return HEX6.test(v) ? v : null;
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(rgb: number[]) {
  return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG 2.2 göreli parlaklık. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** sRGB'de doğrusal karışım; kanal başına yuvarlanır (deterministik). */
export function mix(hex: string, target: string, t: number): string {
  const a = channels(hex);
  const b = channels(target);
  return toHex(a.map((c, i) => c + (b[i] - c) * t));
}

export type AccentTokens = {
  light: { accent: string; fill: string; onFill: string };
  dark: { accent: string; fill: string; onFill: string };
};

/** Bir tonun kullanıldığı bütün çiftler: arka plan üstünde metin, dolgu üstünde metin, kontrol sınırı. */
export function tokenPairs(tokens: AccentTokens) {
  return [
    { theme: "light", use: "duvar üstünde metin", fg: tokens.light.accent, bg: THEME.light.wall, min: TEXT_CONTRAST },
    { theme: "light", use: "kaide üstünde metin", fg: tokens.light.accent, bg: THEME.light.plinth, min: TEXT_CONTRAST },
    { theme: "light", use: "dolgu üstünde metin", fg: tokens.light.onFill, bg: tokens.light.fill, min: TEXT_CONTRAST },
    { theme: "light", use: "odak/kontrol sınırı", fg: tokens.light.fill, bg: THEME.light.wall, min: UI_CONTRAST },
    { theme: "dark", use: "duvar üstünde metin", fg: tokens.dark.accent, bg: THEME.dark.wall, min: TEXT_CONTRAST },
    { theme: "dark", use: "kaide üstünde metin", fg: tokens.dark.accent, bg: THEME.dark.plinth, min: TEXT_CONTRAST },
    { theme: "dark", use: "dolgu üstünde metin", fg: tokens.dark.onFill, bg: tokens.dark.fill, min: TEXT_CONTRAST },
    { theme: "dark", use: "odak/kontrol sınırı", fg: tokens.dark.fill, bg: THEME.dark.wall, min: UI_CONTRAST },
  ] as const;
}

/** Açık temada seçilen ton olduğu gibi kullanılır: duvar, kaide ve beyaz dolgu metniyle okunmalı. */
export function lightReadable(hex: string): boolean {
  return contrast(hex, THEME.light.wall) >= TEXT_CONTRAST
    && contrast(hex, THEME.light.plinth) >= TEXT_CONTRAST
    && contrast(hex, "#ffffff") >= TEXT_CONTRAST;
}

const STEPS = 20;

/** Koyu tema tonu: beyaza doğru %5 adımlarla açılır; iki koyu zeminde de 4.5:1 sağlayan ilk adım. */
export function deriveDark(hex: string): string {
  for (let i = 0; i <= STEPS; i++) {
    const candidate = mix(hex, "#ffffff", i / STEPS);
    if (contrast(candidate, THEME.dark.wall) >= TEXT_CONTRAST
      && contrast(candidate, THEME.dark.plinth) >= TEXT_CONTRAST
      && contrast(candidate, THEME.dark.fillInk) >= TEXT_CONTRAST) return candidate;
  }
  return "#ffffff";
}

export function accentTokens(hex: string): AccentTokens {
  const dark = deriveDark(hex);
  return {
    light: { accent: hex, fill: hex, onFill: "#ffffff" },
    dark: { accent: dark, fill: dark, onFill: THEME.dark.fillInk },
  };
}

export type AccentCheck =
  | { ok: true; color: string; tokens: AccentTokens }
  | { ok: false; error: string; suggestion: string | null };

/**
 * Kaydetmeden önceki karar. Okunamayan renk sessizce değiştirilmez: reddedilir ve en yakın okunabilir
 * öneri (siyaha doğru %5 adımlarla koyulaştırılmış ton) gösterilir.
 */
export function checkAccent(input: unknown): AccentCheck {
  const color = normalizeHex(input);
  if (!color) return { ok: false, error: "Renk #RRGGBB biçiminde olmalı (ör. #0f766e).", suggestion: null };
  if (lightReadable(color)) {
    const tokens = accentTokens(color);
    const failing = tokenPairs(tokens).find((p) => contrast(p.fg, p.bg) < p.min);
    if (!failing) return { ok: true, color, tokens };
  }
  let suggestion: string | null = null;
  for (let i = 1; i <= STEPS; i++) {
    const candidate = mix(color, "#000000", i / STEPS);
    if (lightReadable(candidate)) { suggestion = candidate; break; }
  }
  return {
    ok: false,
    error: `Bu renk açık temada metin için yeterince koyu değil (en az ${TEXT_CONTRAST}:1 gerekir).`,
    suggestion,
  };
}

/** Etkinlik alanına uygulanan CSS değişkenleri. Kök `--indigo` yeniden atanmaz; mühür kimliği korunur. */
export function accentVariables(hex: string | null): Record<string, string> {
  const tokens = accentTokens(hex && lightReadable(hex) ? hex : DEFAULT_ACCENT);
  return {
    "--accent-light": tokens.light.accent,
    "--accent-fill-light": tokens.light.fill,
    "--accent-on-fill-light": tokens.light.onFill,
    "--accent-dark": tokens.dark.accent,
    "--accent-fill-dark": tokens.dark.fill,
    "--accent-on-fill-dark": tokens.dark.onFill,
  };
}
