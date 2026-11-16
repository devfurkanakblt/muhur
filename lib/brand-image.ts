import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { communityLogoUrl, type EventState } from "@/lib/data";
import { eventShowsMascot } from "@/lib/event-features";

/** Görsel motoru WEBP çizmez: her biçim PNG data URI'ye çevrilir. Alınamazsa null (görsel yine üretilir). */
export async function pngDataUrl(url: string | null, size = 320): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const png = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export type BrandArt = { name: string; mascot: string | null; logo: string | null };

/**
 * PNG/SVG yüzeyleri (paylaşım kartı, kazanan kartı, katılım belgesi) için marka: başlıkla aynı karar.
 * DEÜ maskotu yalnız maskotun topluluğunda okunur; diğerlerinde topluluğun (kilitliyse kilit anındaki) logosu.
 */
export async function eventBrandArt(event: EventState): Promise<BrandArt> {
  const name = event.brand.communityName ?? event.communityName ?? "mühür";
  const [mascot, logo] = await Promise.all([
    eventShowsMascot(event)
      ? readFile(join(process.cwd(), "assets/mascot.svg")).then((b) => `data:image/svg+xml;base64,${b.toString("base64")}`)
      : Promise.resolve(null),
    pngDataUrl(communityLogoUrl(event.brand.logoPath), 200),
  ]);
  return { name, mascot, logo };
}
