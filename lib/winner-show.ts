// Sahnedeki kazanan gösterisinin zamanlaması. Saf fonksiyon: sahne bileşeni zamanlayıcıyı buna göre kurar.

/** Ekrandaki kazanan. `ceremony`: açıklanma töreniyle geldi; `run`: aynı kazanan yeniden oynatılınca artar. */
export type Showing = { id: string; ceremony: boolean; since: number; run: number };

export const SHOW = {
  /** Tören ekranda en az bu kadar kalır; arkasından gelen yeni ödül bu süre dolunca açılır. */
  ceremonyHold: 25_000,
  /** Birden çok kazanan varken sessiz dönüş aralığı. */
  rotate: 12_000,
} as const;

/**
 * Sıradaki gösterim ve zamanı; değişecek bir şey yoksa null.
 * - Yeni açıklananlar (queue) sırayla törenle gelir; tören bitmeden yenisi onu kesmez.
 * - Sıra boşsa ve birden çok kazanan varsa ekran sessizce döner.
 * - Gösterilen kazanan kaldırıldıysa hemen sıradakine geçilir.
 */
export function nextShowing(current: Showing | null, queue: string[], ids: string[], now: number):
  { at: number; showing: Showing | null; queue: string[] } | null {
  const pending = queue.filter((id) => ids.includes(id));
  const gone = current !== null && !ids.includes(current.id);
  const run = (current?.run ?? 0) + 1;
  if (pending.length) {
    const at = current && !gone && current.ceremony ? Math.max(now, current.since + SHOW.ceremonyHold) : now;
    return { at, showing: { id: pending[0], ceremony: true, since: at, run }, queue: pending.slice(1) };
  }
  if (!ids.length) return current ? { at: now, showing: null, queue: [] } : null;
  if (!current || gone) return { at: now, showing: { id: ids[0], ceremony: false, since: now, run }, queue: [] };
  if (ids.length === 1) return null;
  const at = Math.max(now, current.since + (current.ceremony ? SHOW.ceremonyHold : SHOW.rotate));
  const next = ids[(ids.indexOf(current.id) + 1) % ids.length];
  return { at, showing: { id: next, ceremony: false, since: at, run }, queue: [] };
}
