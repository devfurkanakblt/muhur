import { createAdminClient } from "@/lib/supabase/server";
import { getEventBySlug, getViewer } from "@/lib/data";
import { getEventAccess } from "@/lib/access";
import { can } from "@/lib/authz";
import { hashArchive } from "@/lib/delivery-core";
import { csvTable, zipEntries } from "@/lib/zip";
import { selectAll } from "@/lib/paginate";
import { exclusionReason, type JuryRow } from "@/lib/jury";

export const maxDuration = 300;

/**
 * ?paket=eksiksiz (varsayılan): tüm kayıtların mühürlü arşivi olmalı; biri eksikse paket verilmez.
 * ?paket=gecerli: yalnızca mühürlü teslimler pakete girer; dışarıda kalanlar nedenleriyle manifest/CSV'de listelenir.
 * ?format=csv: tüm kayıtların durumu.
 * Yetki etkinlik kapsamındadır: topluluk rolü, head admin ya da (kilitten sonra) etkinliğin jürisi.
 */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Yetkisiz" }, { status: 403 });
  const { slug } = await ctx.params;
  const event = await getEventBySlug(slug);
  if (!event) return Response.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
  if (!can(await getEventAccess(viewer, event), "juri-paketi")) return Response.json({ error: "Yetkisiz" }, { status: 403 });
  if (!event.locked) return Response.json({ error: "Jüri paketi teslim kilitlendikten sonra indirilebilir." }, { status: 409 });
  const params = new URL(request.url).searchParams;
  const mode = params.get("paket") === "gecerli" ? "gecerli" : "eksiksiz";
  const db = createAdminClient();
  let projects: JuryRow[];
  try {
    // Satır sınırı sessizce eksik paket üretmesin: sayfalı okunur, toplam sayımla karşılaştırılır.
    projects = await selectAll<JuryRow>((from, to) => db.from("projects").select(
      "id, exhibit_no, name, team_name, summary, demo_url, repo_full_name, frozen_sha, frozen_at, archive_path, archive_sha256, archive_bytes, accepted_sha, accepted_at, accepted_branch, freeze_error, members:project_members(github_login)",
      { count: "exact" },
    ).eq("event_id", event.id).order("exhibit_no").range(from, to).overrideTypes<JuryRow[], { merge: false }>());
  } catch {
    return Response.json({ error: "Teslim listesi okunamadı." }, { status: 500 });
  }
  const names = new Map(projects.map(p => [p.id, `${String(p.exhibit_no).padStart(3, "0")}-${p.id}.zip`]));
  const missing = projects.filter(p => !p.archive_path || !p.archive_sha256);
  const included = projects.filter(p => p.archive_path && p.archive_sha256);
  const manifest = { event: event.title, slug: event.slug, sealTime: event.sealTime, package: mode,
    included: included.length, excluded: missing.length,
    projects: projects.map(p => ({ no: p.exhibit_no, name: p.name, team: p.team_name, summary: p.summary, demo: p.demo_url,
      members: p.members.map(m => m.github_login), repo: p.repo_full_name, sha: p.frozen_sha,
      acceptedAt: p.accepted_at, branch: p.accepted_branch, sha256: p.archive_sha256, bytes: p.archive_bytes,
      file: p.archive_sha256 ? `arsivler/${names.get(p.id)}` : null, status: p.archive_sha256 ? "sealed" : "missing",
      reason: exclusionReason(p) })),
  };
  const csv = csvTable([
    ["No", "Proje", "Ekip", "Üyeler", "Özet", "Demo", "Repo", "Commit", "Dal", "Kabul zamanı", "SHA-256", "Bayt", "Durum", "Pakete girmeme nedeni"],
    ...manifest.projects.map(p => [p.no, p.name, p.team, p.members.join("; "), p.summary, p.demo, p.repo, p.sha, p.branch, p.acceptedAt, p.sha256, p.bytes, p.status, p.reason]),
  ]);
  if (params.get("format") === "csv") {
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${event.slug}-teslimler.csv"`, "Cache-Control": "private, no-store" } });
  }
  if (mode === "eksiksiz" && missing.length) {
    return Response.json({
      error: "Eksiksiz jüri paketi için tüm arşivler tamamlanmalı. Geçerli teslimler paketi (?paket=gecerli) eksik kayıtları nedenleriyle listeler.",
      missing: missing.map(p => ({ no: p.exhibit_no, reason: exclusionReason(p) })),
    }, { status: 409 });
  }
  if (included.length === 0) return Response.json({ error: "Pakete girecek mühürlü teslim yok." }, { status: 409 });
  // Tek indirmede 500 MB; aşan etkinliklerde arşivler tek tek indirilebilir.
  if (included.reduce((n, p) => n + Number(p.archive_bytes ?? 0), 0) > 500 * 1024 * 1024) {
    return Response.json({ error: "Toplu paket 500 MB sınırını aşıyor. CSV listesini ve arşivleri ayrı indir." }, { status: 413 });
  }
  const encode = (text: string) => new TextEncoder().encode(text);
  const entries = [
    { name: "teslimler.json", read: async () => encode(JSON.stringify(manifest, null, 2)) },
    { name: "teslimler.csv", read: async () => encode(csv) },
    { name: "SHA256SUMS.txt", read: async () => encode(included.map(p => `${p.archive_sha256}  arsivler/${names.get(p.id)}`).join("\n") + "\n") },
    ...included.map(p => ({ name: `arsivler/${names.get(p.id)}`, read: async () => {
      const { data, error } = await db.storage.from("archives").download(p.archive_path!);
      if (error || !data) throw new Error(`No. ${p.exhibit_no} arşivi okunamadı.`);
      const zip = new Uint8Array(await data.arrayBuffer());
      if (zip.byteLength !== Number(p.archive_bytes) || hashArchive(zip) !== p.archive_sha256) throw new Error(`No. ${p.exhibit_no} bütünlük kontrolü başarısız.`);
      return zip;
    } })),
  ];
  const iterator = zipEntries(entries);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next();
        if (result.done) controller.close(); else controller.enqueue(result.value);
      } catch (error) { controller.error(error); }
    },
    async cancel() { await iterator.return(); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${event.slug}-juri${mode === "gecerli" ? "-gecerli" : ""}.zip"`, "Cache-Control": "private, no-store" } });
}
