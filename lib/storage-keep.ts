// Depo temizliğinin saf kararları: hangi logo korunur, hangisi sahipsizdir. Bağımlılıksız; test edilebilir.

export type Listed = { name: string; id: string | null; created_at: string | null };

/** Yaşayan proje logoları, toplulukların güncel logoları ve mühürlü görünümlerdeki (snapshot) logolar. */
export function logoKeepSet(
  projects: { logo_path: string | null }[],
  communities: { logo_path: string | null }[],
  snapshots: { community_logo_path: string | null }[],
): Set<string> {
  const keep = new Set<string>();
  for (const p of projects) if (p.logo_path) keep.add(p.logo_path);
  for (const c of communities) if (c.logo_path) keep.add(c.logo_path);
  for (const s of snapshots) if (s.community_logo_path) keep.add(s.community_logo_path);
  return keep;
}

/** Klasör girdisi (id yok) ve yaş eşiğinden genç dosya asla silinmez; korunan yol silinmez. */
export function orphanLogo(path: string, file: Listed, keep: Set<string>, now: number, minAgeMs: number): boolean {
  if (!file.id || !file.created_at) return false;
  if (now - new Date(file.created_at).getTime() < minAgeMs) return false;
  return !keep.has(path);
}
