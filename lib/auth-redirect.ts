/** Yalnız aynı siteye ait kök yollar; ters eğik çizgi ve kontrol karakterleri kabul edilmez. */
export function safeAuthNext(raw: unknown, fallback = "/panel"): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u0020]/.test(raw)) return fallback;
  return raw;
}
