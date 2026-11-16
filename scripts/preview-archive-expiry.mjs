// 30 günlük arşiv saklama · SALT OKUNUR kuru koşum. Storage'a hiçbir silme isteği göndermez, defter yazmaz.
// Kullanım: node --import ./tests/register.mjs scripts/preview-archive-expiry.mjs [etkinlik-slug ...] [--json]
// Gerçek DB değerleri okunur (kilit zamanı, vade, dosya sayısı/boyutu, manifest özeti); tarih bir belgeden
// kopyalanmaz. Manifest sayfalı okunur, beklenen toplamla ve DB özetiyle karşılaştırılır; uyuşmazlıkta durur.
import envPackage from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { manifestHash } from "../lib/archive-retention.ts";

envPackage.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase ortam değişkenleri eksik; önizleme yapılamadı. Anahtar değerleri yazdırılmaz.");
  process.exit(1);
}
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const slugs = args.filter((a) => !a.startsWith("--"));
const db = createClient(url, key, { auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }) } });

async function pagedManifest(eventId) {
  const rows = [];
  let expected = null;
  for (let from = 0; ; ) {
    const { data, error, count } = await db.rpc("archive_expiry_manifest", { p_event: eventId }, { count: "exact" }).order("path").range(from, from + 499);
    if (error) throw new Error(`Manifest okunamadı: ${error.message}`);
    if (expected === null) expected = count ?? null;
    rows.push(...(data ?? []));
    from += (data ?? []).length;
    if (!data?.length || (expected !== null && rows.length >= expected)) break;
  }
  if (expected !== null && rows.length !== expected) throw new Error(`Manifest eksik okundu (${rows.length}/${expected}).`);
  return rows;
}

let query = db.from("events").select("id, slug, title, locked_at, archive_expires_at").not("locked_at", "is", null).order("locked_at");
if (slugs.length) query = query.in("slug", slugs);
const { data: events, error } = await query;
if (error) { console.error(`Etkinlikler okunamadı: ${error.message}`); process.exit(1); }
const report = [];
let failed = false;
for (const event of events ?? []) {
  try {
    const { data: preview, error: previewError } = await db.rpc("archive_expiry_preview", { p_event: event.id });
    if (previewError) throw new Error(previewError.message);
    const rows = await pagedManifest(event.id);
    const hash = manifestHash(rows);
    if (hash !== preview.manifest_hash || rows.length !== preview.objects) {
      throw new Error(`Manifest uyuşmazlığı: sayfalı okuma ${rows.length} satır / ${hash}, DB ${preview.objects} / ${preview.manifest_hash}`);
    }
    report.push({ slug: event.slug, title: event.title, locked_at: event.locked_at, expires_at: event.archive_expires_at,
      availability: preview.availability, objects: preview.objects, bytes: Number(preview.bytes), manifest_hash: hash, run: preview.run?.state ?? null });
  } catch (e) {
    failed = true;
    report.push({ slug: event.slug, error: e instanceof Error ? e.message : String(e) });
  }
}
if (asJson) console.log(JSON.stringify({ generated_at: new Date().toISOString(), events: report }, null, 2));
else {
  console.log("Arşiv saklama önizlemesi (salt okunur; hiçbir dosya silinmedi)");
  for (const r of report) {
    if (r.error) { console.log(`✖ ${r.slug}: ${r.error}`); continue; }
    console.log(`• ${r.slug} · kilit ${r.locked_at} · vade ${r.expires_at} · ${r.availability} · ${r.objects} dosya · ${(r.bytes / 1048576).toFixed(1)} MB · manifest ${r.manifest_hash.slice(0, 16)}… · defter ${r.run ?? "hazırlanmadı"}`);
  }
}
if (failed) process.exitCode = 1;
