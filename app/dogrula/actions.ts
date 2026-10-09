"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { exhibitPath } from "@/lib/data";

export type Match = {
  kind: "arsiv" | "commit";
  name: string;
  team: string;
  no: number;
  event: string;
  href: string;
  sealedAt: string | null;
  sha: string | null;
  /** Commit araması tam 40 haneli SHA ile mi yapıldı; kısa önek birden çok commit'e uyabilir. */
  exactCommit: boolean;
};

/**
 * SHA-256 (arşiv) ya da commit SHA ile mühür kaydı arar. Dosyanın kendisi sunucuya gelmez.
 * Yalnızca arşivi tamamlanmış (hash'i yazılmış) mühürler sonuç sayılır. Okuma hatası "eşleşme yok" olarak
 * döndürülmez; istemci hata mesajı gösterir.
 */
export async function lookupSeal(query: string): Promise<Match[]> {
  const q = query.trim().toLowerCase();
  if (!/^[0-9a-f]{7,64}$/.test(q)) return [];
  const db = createAdminClient();
  const select = "name, team_name, exhibit_no, frozen_sha, frozen_at, archive_sha256, events(title, slug)";
  const [byArchive, byCommit] = await Promise.all([
    q.length === 64 ? db.from("projects").select(select).eq("archive_sha256", q) : Promise.resolve({ data: [], error: null }),
    q.length <= 40
      ? db.from("projects").select(select).like("frozen_sha", q.length === 40 ? q : `${q}%`).not("archive_sha256", "is", null).limit(10)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (byArchive.error || byCommit.error) {
    console.error("[doğrula]", byArchive.error?.message ?? byCommit.error?.message);
    throw new Error("Doğrulama kayıtları okunamadı.");
  }

  type Row = { name: string; team_name: string; exhibit_no: number; frozen_sha: string | null; frozen_at: string | null; events: { title: string; slug: string } | null };
  const toMatch = (kind: Match["kind"]) => (r: Row): Match => ({
    kind,
    name: r.name,
    team: r.team_name,
    no: r.exhibit_no,
    event: r.events?.title ?? "",
    href: r.events ? exhibitPath(r.events.slug, r.exhibit_no) : "/",
    sealedAt: r.frozen_at,
    sha: r.frozen_sha,
    exactCommit: q.length === 40,
  });
  return [
    ...((byArchive.data ?? []) as unknown as Row[]).map(toMatch("arsiv")),
    ...((byCommit.data ?? []) as unknown as Row[]).filter((r) => r.frozen_sha).map(toMatch("commit")),
  ];
}
