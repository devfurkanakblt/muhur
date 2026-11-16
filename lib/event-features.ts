// Etkinlik bazlı isteğe bağlı özellikler. Saf kararlar: DB (0019) aynı kuralları ayrıca uygular.

export const FEATURE_KEYS = ["public_voting", "mystery_hunt", "easter_eggs", "mascot_naming"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type EventFeatures = Record<FeatureKey, boolean>;

/** Maskot ve maskot isimlendirmesi bu topluluğa aittir. */
export const MASCOT_COMMUNITY = "deu-csai";

export const FEATURE_LABELS: Record<FeatureKey, { title: string; hint: string }> = {
  public_voting: { title: "Halk oylaması", hint: "Kilitten sonra GitHub ile giriş yapan ziyaretçiler bir esere oy verebilir." },
  mystery_hunt: { title: "Gizem avı", hint: "Etkinlik saatlerinde gizli cümleyi çözenlerin ekibi rozet alır." },
  easter_eggs: { title: "Klavye sürprizleri", hint: "Kısayol ve konsol sürprizleri. Teslim veya kilidi etkilemez." },
  mascot_naming: { title: "Maskota isim ver", hint: "Yalnız DEÜ CS&AI etkinliklerinde açılabilir." },
};

/** Kullanıcıya gösterilen ret mesajı; DB'nin OZELLIK: önekiyle aynı anlam. */
export const FEATURE_DISABLED: Record<FeatureKey, string> = {
  public_voting: "Halk oylaması bu etkinlikte kapalı.",
  mystery_hunt: "Gizem avı bu etkinlikte kapalı.",
  easter_eggs: "Bu etkinlikte klavye sürprizleri kapalı.",
  mascot_naming: "Maskot isimlendirme bu etkinlikte kapalı.",
};

export const ALL_OFF: EventFeatures = { public_voting: false, mystery_hunt: false, easter_eggs: false, mascot_naming: false };

/** Topluluğu olmayan (Plan 1 öncesi) etkinlik DEÜ sayılır; DB `is_mascot_community` ile aynı. */
export function isMascotCommunity(communitySlug: string | null | undefined, hasCommunity = communitySlug != null): boolean {
  return !hasCommunity || communitySlug === MASCOT_COMMUNITY;
}

export function defaultFeatures(communitySlug: string | null, hasCommunity = communitySlug != null): EventFeatures {
  const on = isMascotCommunity(communitySlug, hasCommunity);
  return { public_voting: on, mystery_hunt: on, easter_eggs: on, mascot_naming: on };
}

/**
 * DB satırından gelen değer. Eksik ya da boolean olmayan anahtar kapalı sayılır (fail-closed).
 * Maskot isimlendirme bayrak açık olsa bile başka toplulukta kapalıdır.
 */
export function parseFeatures(raw: unknown, communitySlug: string | null, hasCommunity = communitySlug != null): EventFeatures {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...ALL_OFF };
  for (const key of FEATURE_KEYS) out[key] = source[key] === true;
  if (!isMascotCommunity(communitySlug, hasCommunity)) out.mascot_naming = false;
  return out;
}

/** Yönetim formu: işaretli kutular. Formda olmayan anahtar kapalıdır; bilinmeyen alanlar yok sayılır. */
export function featuresFromForm(form: FormData): EventFeatures {
  const out = { ...ALL_OFF };
  for (const key of FEATURE_KEYS) out[key] = form.get(`feature_${key}`) === "on";
  return out;
}

/**
 * Bu etkinliğin yüzeylerinde (sayfa, görsel, belge, sahne, makbuz, paylaşım kartı) DEÜ maskotu görünebilir mi?
 * Header, PNG/SVG ve RSC aynı kararı kullanır. Özellik bayrağından bağımsızdır: maskot topluluğa aittir.
 */
export function eventShowsMascot(event: { communitySlug: string | null; communityId: string | null }): boolean {
  return isMascotCommunity(event.communitySlug, event.communityId != null);
}

