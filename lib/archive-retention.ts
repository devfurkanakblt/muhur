// 30 günlük arşiv saklama: saf kararlar ve metinler. Bağımlılıksız (node:crypto dışında); sunucu, betik ve
// testler aynı kuralları kullanır. Yetkili karar zamanı DB'dir (archive_access); buradaki hesap arayüz içindir.
import { createHash } from "node:crypto";

export const RETENTION_HOURS = 720;
export const EXPIRING_HOURS = 72;
export const RETENTION_MESSAGE = "Arşivin 30 günlük saklama süresi doldu.";
export const SEAL_VALID_FILE_EXPIRED = "Mühür kaydı geçerli; dosyanın saklama süresi doldu.";
/** Politika gereği silinen dosya ile beklenmeyen kayıp ayrı gösterilir. */
export const ARCHIVE_MISSING_MESSAGE = "Arşiv dosyası depoda bulunamadı. Bu beklenmeyen bir durum; platform yöneticisine haber ver.";

export type Availability = "available" | "expiring" | "expired";

/** Vade = kalıcı locked_at + 720 saat; kilit yokken null. */
export function archiveExpiresAt(lockedAt: string | null): string | null {
  if (!lockedAt) return null;
  return new Date(new Date(lockedAt).getTime() + RETENTION_HOURS * 3600_000).toISOString();
}

/** DB `archive_availability` ile aynı eşikler: tam vade anında süre dolmuştur. */
export function archiveAvailability(expiresAt: string | null, now: number): Availability {
  if (!expiresAt) return "available";
  const left = new Date(expiresAt).getTime() - now;
  if (left <= 0) return "expired";
  return left <= EXPIRING_HOURS * 3600_000 ? "expiring" : "available";
}

/** İmzalı URL bu süreden kısa kalacaksa yeni URL verilmez (politika anından sonra geçerli kalmasın). */
export const MIN_SIGNED_URL_SECONDS = 10;

/**
 * İmzalı indirme adresinin ömrü: mevcut kısa sınır ile kalan saklama süresinin küçüğü. Süre çok azsa ya da
 * dolmuşsa null (yeni URL verilmez). `secondsLeft` null ise etkinlik kilitli değildir.
 */
export function signedUrlSeconds(secondsLeft: number | null, max = 60): number | null {
  if (secondsLeft === null) return max;
  if (!Number.isFinite(secondsLeft) || secondsLeft < MIN_SIGNED_URL_SECONDS) return null;
  return Math.min(max, Math.floor(secondsLeft));
}

export type ManifestRow = { path: string; bytes: number | string | null; sha256: string | null };

/** DB `archive_expiry_preview` ile aynı satır biçimi: "yol\tbayt\tsha256", bayt sırasıyla sıralı. */
export function manifestLines(rows: ManifestRow[]): string[] {
  return rows
    .map((r) => `${r.path}\t${r.bytes ?? ""}\t${r.sha256 ?? ""}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function manifestHash(rows: ManifestRow[]): string {
  return createHash("sha256").update(manifestLines(rows).join("\n"), "utf8").digest("hex");
}

/** Saklama ledger'ındaki dosya durumunun kullanıcı metni. */
export function retentionLabel(state: Availability, expiresAt: string | null, format: (iso: string) => string): string {
  if (!expiresAt) return "Arşiv kilitten sonra 30 gün saklanır.";
  if (state === "expired") return `${RETENTION_MESSAGE} Mühür kaydı ve SHA-256 doğrulaması geçerliliğini korur.`;
  return `Arşiv dosyası ${format(expiresAt)} tarihine kadar indirilebilir; sonra silinir, mühür kaydı kalır.`;
}
