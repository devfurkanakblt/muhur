/** Etkinlik adresleri ve ana sayfa/eski adres seçimi. Saf modül: sunucu bağımlılığı yok. */

export type EventSurface = "panel" | "sahne" | "yonetim" | "belge" | "maskot";

/** `/e/<slug>` ya da `/e/<slug>/<yüzey>`. */
export function eventPath(slug: string, surface?: EventSurface): string {
  const base = `/e/${encodeURIComponent(slug)}`;
  return surface ? `${base}/${surface}` : base;
}

export type ListedEvent = {
  id: string;
  slug: string;
  startsAt: string;
  deadline: string;
  lockedAt: string | null;
  sealTime: string;
  suspended: boolean;
  communityStatus: string | null;
};

/** Ana sayfada listelenir: topluluğu onaylı ve etkinlik askıda değil. */
export function isListed(e: ListedEvent): boolean {
  return e.communityStatus === "onaylandi" && !e.suspended;
}

const PAST_LIMIT = 12;

/** Listelenen etkinlikleri açık (son teslime göre artan) ve geçmiş (mühre göre azalan, en çok 12) diye ayırır. */
export function splitHomeEvents<T extends ListedEvent>(events: T[], now: number): { active: T[]; past: T[] } {
  const listed = events.filter(isListed);
  const isOpen = (e: T) => e.lockedAt == null && now < Date.parse(e.deadline);
  const active = listed.filter(isOpen).sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  const past = listed
    .filter((e) => !isOpen(e))
    .sort((a, b) => Date.parse(b.sealTime) - Date.parse(a.sealTime))
    .slice(0, PAST_LIMIT);
  return { active, past };
}

/** Eski adresler (/panel, /sahne…) için en uygun etkinlik: en yakın açık, yoksa en yeni mühürlü. */
export function pickLegacyEvent<T extends ListedEvent>(events: T[], now: number): T | null {
  const { active, past } = splitHomeEvents(events, now);
  return active[0] ?? past[0] ?? null;
}
