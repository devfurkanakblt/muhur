// Vitrin logoları: hepsi aynı kare kaidede, kaidenin %46'sında durur. Kare ve yeterli çözünürlük zorunlu.
export const LOGO = {
  types: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>,
  maxBytes: 1024 * 1024,
  minSide: 512,
  maxSide: 2048,
  /** Kare kabul edilen en büyük kenar farkı (dışa aktarmadaki yuvarlama payı). */
  squareTolerance: 2,
  recommended: "512 × 512 px kare, şeffaf zeminli PNG",
} as const;

/** Boyut kuralını uygular; uygunsa null, değilse kullanıcıya gösterilecek hata. */
export function logoSizeError(width: number, height: number): string | null {
  if (!width || !height) return "Logonun boyutu okunamadı. PNG, JPG ya da WEBP olarak yeniden dışa aktar.";
  if (Math.abs(width - height) > LOGO.squareTolerance) return `Logo kare olmalı; seçtiğin görsel ${width} × ${height} px.`;
  if (Math.min(width, height) < LOGO.minSide) return `Logo en az ${LOGO.minSide} × ${LOGO.minSide} px olmalı; seçtiğin görsel ${width} × ${height} px.`;
  if (Math.max(width, height) > LOGO.maxSide) return `Logo en fazla ${LOGO.maxSide} × ${LOGO.maxSide} px olabilir; seçtiğin görsel ${width} × ${height} px.`;
  return null;
}

/** PNG, JPEG ve WEBP başlığından boyutu okur; görseli çözmez. Tanınmazsa null. */
export function readImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const b = bytes;
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

  // PNG: imza + IHDR
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 3) === "PNG" && ascii(12, 4) === "IHDR") {
    return { width: u32be(16), height: u32be(20) };
  }

  // WEBP: RIFF....WEBP + VP8 / VP8L / VP8X
  if (b.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 ") return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    if (chunk === "VP8L")
      return {
        width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
        height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
      };
    if (chunk === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    return null;
  }

  // JPEG: SOF işaretçisini bulana kadar bölümleri atla
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) {
        i += 1;
        continue;
      }
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { width: u16be(i + 7), height: u16be(i + 5) };
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}
