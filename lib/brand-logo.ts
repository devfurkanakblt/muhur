import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { normalizeLogo } from "./logo-image";
import { LOGO } from "./logo-spec";

/** Topluluk logosu: proje logosuyla aynı kare/çözünürlük kuralı; çıktı her zaman metadatasız WEBP. */
export type CommunityLogo = { bytes: Uint8Array; width: number; height: number };

/**
 * Görsel sunucuda gerçekten çözülür (bildirilen türle eşleşme, tek kare, boyut kuralı), yönü uygulanır ve
 * WEBP olarak yeniden kodlanır; EXIF/ICC/XMP atılır. SVG, HTML taklidi ve hareketli görsel reddedilir.
 */
export async function normalizeCommunityLogo(bytes: Uint8Array, declaredType: string): Promise<CommunityLogo | string> {
  const base = await normalizeLogo(bytes, declaredType);
  if (typeof base === "string") return base;
  try {
    const { data, info } = await sharp(base.bytes, { failOn: "error", limitInputPixels: (LOGO.maxSide + LOGO.squareTolerance) ** 2 })
      .webp({ quality: 90, alphaQuality: 100 })
      .toBuffer({ resolveWithObject: true });
    if (data.byteLength > LOGO.maxBytes) return "Logo sıkıştırıldıktan sonra 1 MB'ı aşıyor; daha sade ya da küçük bir görsel dene.";
    return { bytes: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    return "Logo açılamadı. Dosya bozuk olabilir; PNG, JPG ya da WEBP olarak yeniden dışa aktar.";
  }
}

const PATH = /^topluluk\/[0-9a-f-]{36}\/[a-f0-9]{24}\.webp$/;

/** İstemci yol veremez: yol topluluk kimliği ve sunucuda üretilen rastgele addan oluşur. */
export function communityLogoPath(communityId: string, random = randomBytes(12).toString("hex")): string {
  const path = `topluluk/${communityId}/${random}.webp`;
  if (!PATH.test(path) || !path.startsWith(`topluluk/${communityId}/`)) throw new Error("Geçersiz topluluk logo yolu.");
  return path;
}

export function isCommunityLogoPath(path: string, communityId?: string): boolean {
  return PATH.test(path) && (!communityId || path.startsWith(`topluluk/${communityId}/`));
}

export type BrandingDeps = {
  upload: (path: string, bytes: Uint8Array) => Promise<void>;
  /** DB RPC: değişiklikleri yazar, silinebilir eski logo yolunu (referanssızsa) döndürür. */
  save: (changes: Record<string, string | null>) => Promise<{ previousLogo: string | null }>;
  remove: (path: string) => Promise<void>;
};

/**
 * Yükle → DB'ye yaz → eski logoyu temizle. DB yazması başarısızsa yeni dosya telafiyle silinir; silme de
 * başarısız olursa dosya sahipsiz kalır ve depo temizliği (24 saat sonra) toplar. Eski logo yalnız DB
 * onu referanssız bildirdiyse silinir: mühürlü bir sergide kullanılan logo hiçbir zaman buradan silinmez.
 */
export async function saveCommunityBranding(
  communityId: string,
  fields: Record<string, string | null>,
  logo: CommunityLogo | null,
  deps: BrandingDeps,
): Promise<{ logoPath: string | null }> {
  let uploaded: string | null = null;
  const changes = { ...fields };
  if (logo) {
    uploaded = communityLogoPath(communityId);
    await deps.upload(uploaded, logo.bytes);
    changes.logo_path = uploaded;
  }
  let previousLogo: string | null;
  try {
    ({ previousLogo } = await deps.save(changes));
  } catch (e) {
    if (uploaded) await deps.remove(uploaded).catch(() => {});
    throw e;
  }
  if (previousLogo && previousLogo !== uploaded && isCommunityLogoPath(previousLogo, communityId)) {
    await deps.remove(previousLogo).catch(() => {});
  }
  return { logoPath: uploaded };
}
