import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { selectAll } from "@/lib/paginate";
import { logoKeepSet, orphanLogo, type Listed } from "@/lib/storage-keep";

/** Yeni yüklenen ya da işlenmekte olan dosyaya dokunmamak için yaş eşiği. */
const MIN_AGE_MS = 24 * 3600_000;
const MAX_DELETE = 200;

async function listAll(bucket: string, prefix: string) {
  const db = createAdminClient();
  const out: Listed[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`${bucket}/${prefix} listelenemedi: ${error.message}`);
    out.push(...((data ?? []) as Listed[]));
    if ((data ?? []).length < 1000) return out;
  }
}

const old = (f: Listed, now: number) => !!f.id && !!f.created_at && now - new Date(f.created_at).getTime() >= MIN_AGE_MS;

/**
 * Depodaki dosyaları DB referanslarıyla karşılaştırır; hiçbir kayda bağlı olmayan ve 24 saatten eski dosyaları siler.
 * Mühürlü, güncel kabul, budanmamış kabul geçmişi, ara mühür ve aktif iş dosyaları her zaman korunur.
 * Logolarda proje logosu, topluluğun güncel logosu ve mühürlü etkinlik görünümündeki (snapshot) logo korunur.
 * Süreli arşiv silme (30 gün) bu temizliğin işi değildir; ayrı işçidedir (lib/archive-expiry-worker.ts).
 * Herhangi bir okuma başarısız olursa hiçbir şey silinmez. Silinenler denetim kaydına yazılır.
 */
export async function sweepStorage(now = Date.now()) {
  const db = createAdminClient();
  const [projects, snapshots, submissions, jobs, communities, brandSnapshots] = await Promise.all([
    selectAll<{ id: string; archive_path: string | null; accepted_archive_path: string | null; logo_path: string | null }>((from, to) =>
      db.from("projects").select("id, archive_path, accepted_archive_path, logo_path", { count: "exact" }).order("id").range(from, to)),
    selectAll<{ archive_path: string }>((from, to) =>
      db.from("snapshots").select("archive_path", { count: "exact" }).order("id").range(from, to)),
    selectAll<{ archive_path: string }>((from, to) =>
      db.from("submissions").select("archive_path", { count: "exact" }).is("archive_pruned_at", null).order("id").range(from, to)),
    selectAll<{ id: string }>((from, to) =>
      db.from("delivery_jobs").select("id", { count: "exact" }).eq("kind", "submit").in("state", ["queued", "processing"]).order("id").range(from, to)),
    selectAll<{ logo_path: string | null }>((from, to) =>
      db.from("communities").select("logo_path", { count: "exact" }).not("logo_path", "is", null).order("id").range(from, to)),
    selectAll<{ community_logo_path: string | null }>((from, to) =>
      db.from("event_brand_snapshots").select("community_logo_path", { count: "exact" }).not("community_logo_path", "is", null).order("event_id").range(from, to)),
  ]);
  const keep = new Set<string>();
  for (const p of projects) for (const path of [p.archive_path, p.accepted_archive_path]) if (path) keep.add(path);
  for (const s of snapshots) keep.add(s.archive_path);
  for (const s of submissions) keep.add(s.archive_path);
  for (const j of jobs) keep.add(`teslim/${j.id}.zip`);

  const archives: string[] = [];
  for (const f of await listAll("archives", "teslim")) {
    const path = `teslim/${f.name}`;
    if (old(f, now) && !keep.has(path)) archives.push(path);
  }
  for (const folder of (await listAll("archives", "ara-muhur")).filter((f) => !f.id)) {
    for (const f of await listAll("archives", `ara-muhur/${folder.name}`)) {
      const path = `ara-muhur/${folder.name}/${f.name}`;
      if (old(f, now) && !keep.has(path)) archives.push(path);
    }
  }

  const keepLogos = logoKeepSet(projects, communities, brandSnapshots);
  const logos: string[] = [];
  for (const folder of (await listAll("logos", "")).filter((f) => !f.id)) {
    // Topluluk logoları bir seviye daha derindedir: topluluk/<topluluk-id>/<dosya>.webp
    if (folder.name === "topluluk") {
      for (const community of (await listAll("logos", "topluluk")).filter((f) => !f.id)) {
        for (const f of await listAll("logos", `topluluk/${community.name}`)) {
          const path = `topluluk/${community.name}/${f.name}`;
          if (orphanLogo(path, f, keepLogos, now, MIN_AGE_MS)) logos.push(path);
        }
      }
      continue;
    }
    for (const f of await listAll("logos", folder.name)) {
      const path = `${folder.name}/${f.name}`;
      if (orphanLogo(path, f, keepLogos, now, MIN_AGE_MS)) logos.push(path);
    }
  }

  const removeArchives = archives.slice(0, MAX_DELETE);
  const removeLogos = logos.slice(0, Math.max(0, MAX_DELETE - removeArchives.length));
  for (let i = 0; i < removeArchives.length; i += 100) {
    const { error } = await db.storage.from("archives").remove(removeArchives.slice(i, i + 100));
    if (error) throw new Error(`Arşiv temizliği: ${error.message}`);
  }
  for (let i = 0; i < removeLogos.length; i += 100) {
    const { error } = await db.storage.from("logos").remove(removeLogos.slice(i, i + 100));
    if (error) throw new Error(`Logo temizliği: ${error.message}`);
  }
  if (removeArchives.length || removeLogos.length) {
    await db.rpc("log_admin", {
      p_actor: null, p_login: "zamanlayıcı", p_action: "storage_sweep",
      p_after: { archives: removeArchives, logos: removeLogos, remaining: archives.length + logos.length - removeArchives.length - removeLogos.length },
    });
  }
  return { archives: removeArchives.length, logos: removeLogos.length };
}
