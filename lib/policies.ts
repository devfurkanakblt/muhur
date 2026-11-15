// Sözleşme belgeleri için saf yardımcılar (Plan 4). Sunucu, istemci formları, betik ve testler aynı kuralları kullanır.
// Bağımlılıksızdır (istemci paketine girebilir); SHA-256 hesabı lib/policy-hash.ts'dedir.

export type PolicyKind = "platform" | "data_processing" | "participant";
export const POLICY_KINDS: readonly PolicyKind[] = ["platform", "data_processing", "participant"];
export const MANAGEMENT_KINDS: readonly PolicyKind[] = ["platform", "data_processing"];

const SLUGS: Record<PolicyKind, string> = { platform: "platform", data_processing: "veri-isleme", participant: "katilimci" };
const TITLES: Record<PolicyKind, string> = { platform: "Platform Kullanım Sözleşmesi", data_processing: "Veri işleme eki", participant: "Katılımcı koşulları" };

export const isPolicyKind = (value: unknown): value is PolicyKind => typeof value === "string" && (POLICY_KINDS as readonly string[]).includes(value);
export const policyTitle = (kind: PolicyKind) => TITLES[kind];
export function policyKindFromSlug(slug: string): PolicyKind | null {
  return (Object.keys(SLUGS) as PolicyKind[]).find(k => SLUGS[k] === slug) ?? null;
}
/** Yayınlanmış/emekli sürümün değişmez adresi: /kosullar/<tür>/<sürüm>. */
export function policyPath(kind: PolicyKind, version: string) {
  return `/kosullar/${SLUGS[kind]}/${encodeURIComponent(version)}`;
}

/** SQL create_policy_draft ile aynı kural: 1-40 karakter, adreste güvenli. */
export const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
export const POLICY_MAX_CHARS = 200_000;

/**
 * Yayın politikası: UTF-8 metin, baştaki BOM atılır, satır sonları LF, Unicode NFC.
 * Hash bu normalleştirilmiş metnin UTF-8 baytlarından hesaplanır; sayfada gösterilen metin de budur.
 */
export function normalizePolicyText(raw: string): string {
  return raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").normalize("NFC");
}
/** Taslağa gönderilmeden önce yerel doğrulama; SQL aynı kuralları ayrıca uygular. */
export function policyDraftError(kind: unknown, version: string, text: string): string | null {
  if (!isPolicyKind(kind)) return "Belge türü platform, data_processing veya participant olmalı.";
  if (!POLICY_VERSION.test(version)) return "Sürüm 1-40 harf, rakam, nokta, alt çizgi veya tire olmalı.";
  if (!text.trim()) return "Belge metni boş olamaz.";
  if (text.length > POLICY_MAX_CHARS) return "Belge metni 200000 karakteri aşamaz.";
  if (text !== normalizePolicyText(text)) return "Belge metni normalleştirilmemiş (NFC ve LF olmalı).";
  return null;
}

/** Yalnız açıkça işaretlenmiş checkbox onay sayılır; belge kimliğinin formda bulunması onay değildir. */
export const checked = (form: FormData, name: string) => form.get(name) === "on";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Formdan gelen belge kimlikleri: yinelenenler tekilleştirilir, biçimi bozuk değer bütün listeyi geçersiz kılar. */
export function documentIds(values: FormDataEntryValue[]): string[] | null {
  const ids = values.map(v => String(v).trim());
  if (!ids.length || ids.some(id => !UUID.test(id))) return null;
  return [...new Set(ids.map(id => id.toLowerCase()))];
}

/** Onaydan sonra dönülecek yol: yalnız aynı sitedeki göreli yol; onay sayfasına geri döngü yok. */
export function safeConsentNext(raw: unknown, fallback: string): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || [...value].some(c => c.charCodeAt(0) < 32) || value.length > 512) return fallback;
  let url: URL;
  try { url = new URL(value, "https://muhur.invalid"); } catch { return fallback; }
  if (url.origin !== "https://muhur.invalid" || /^\/topluluk\/[^/]+\/onay\/?$/.test(url.pathname)) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** DB'nin ONAY: önekli hataları kullanıcıya önek olmadan gösterilir. */
export function consentError(message: string): string | null {
  const match = /ONAY:\s*([^\n]+)/.exec(message);
  return match ? match[1].trim() : null;
}
