import sharp from "sharp";
import { LOGO, logoSizeError } from "./logo-spec";

const FORMATS: Record<string, "png" | "jpeg" | "webp"> = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" };
const UNREADABLE = "Logo açılamadı. Dosya bozuk olabilir; PNG, JPG ya da WEBP olarak yeniden dışa aktar.";

export type NormalizedLogo = { bytes: Uint8Array; type: string; ext: string; width: number; height: number };

/**
 * Logo sunucuda gerçekten çözülür: içerik bildirilen türle eşleşmeli, boyut kuralı çözülmüş görsele uygulanır.
 * Aynı biçimde yeniden kodlanır; EXIF/ICC gibi meta veriler atılır, yön bilgisi piksellere uygulanır.
 */
export async function normalizeLogo(bytes: Uint8Array, declaredType: string): Promise<NormalizedLogo | string> {
  const format = FORMATS[declaredType];
  if (!format) return "Logo PNG, JPG ya da WEBP olmalı.";
  if (bytes.byteLength > LOGO.maxBytes) return "Logo en fazla 1 MB olabilir.";
  try {
    const meta = await sharp(bytes).metadata();
    if (meta.format !== format) return "Dosyanın içeriği türüyle uyuşmuyor. PNG, JPG ya da WEBP olarak yeniden dışa aktar.";
    if ((meta.pages ?? 1) > 1) return "Hareketli logo kabul edilmiyor.";
    const headerError = logoSizeError(meta.width ?? 0, meta.height ?? 0);
    if (headerError) return headerError;

    const pipeline = sharp(bytes, { failOn: "error", limitInputPixels: (LOGO.maxSide + LOGO.squareTolerance) ** 2 }).rotate();
    const encoded = format === "png" ? pipeline.png({ compressionLevel: 9 })
      : format === "jpeg" ? pipeline.jpeg({ quality: 90, mozjpeg: true })
      : pipeline.webp({ quality: 90, alphaQuality: 100 });
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    const sizeError = logoSizeError(info.width, info.height);
    if (sizeError) return sizeError;
    return { bytes: new Uint8Array(data), type: declaredType, ext: LOGO.types[declaredType], width: info.width, height: info.height };
  } catch {
    return UNREADABLE;
  }
}
