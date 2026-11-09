import { NextResponse, type NextRequest } from "next/server";
import { getEventById, getViewer } from "@/lib/data";
import { getEventAccess } from "@/lib/access";
import { can, type EventAccess } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/server";
import { canDownloadArchive } from "@/lib/delivery-policy";
import { auditHeadAdminDownload, isHeadAdminOnly } from "@/lib/download-audit";

/**
 * Arşiv: projenin etkinliğini inceleme yetkisi olanlar (topluluk rolü, head admin), kilitten sonra etkinliğin
 * jürisi ve eserin kendi ekibi indirebilir. Mühürlü arşiv varsa o; yoksa (ya da ?surum=kabul ile) süre dolmadan
 * kabul edilmiş son teslim arşivi. Ekip kilitten önce kendi teslimini indirip doğrulayabilir. Başka topluluğun
 * organizatörü indiremez. Head admin'in yalnızca platform yetkisiyle yaptığı indirme denetim kaydına girer.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/arsiv/[id]">) {
  const { id } = await ctx.params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Arşiv yok" }, { status: 404 });
  const db = createAdminClient();
  const { data: row, error } = await db.from("projects").select("event_id, archive_path, accepted_archive_path").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Arşiv kaydı okunamadı. Tekrar dene." }, { status: 503 });
  if (!row) return NextResponse.json({ error: "Arşiv yok" }, { status: 404 });
  let access: EventAccess | null;
  try {
    const event = await getEventById(row.event_id);
    access = event ? await getEventAccess(viewer, event) : null;
  } catch {
    return NextResponse.json({ error: "Yetki denetlenemedi. Tekrar dene." }, { status: 503 });
  }
  const canInspect = can(access, "juri-paketi");
  const headAdminOnly = isHeadAdminOnly(access);
  let isMember = false;
  // Ekip üyeliği hem yetkisizlerde hem de head admin'in kendi ekibinin arşivini indirmesinde (kayıt gerekmez) bakılır.
  if (!canInspect || headAdminOnly) {
    const { data: member, error: memberError } = await db.from("project_members").select("user_id").eq("project_id", id).eq("user_id", viewer.id).maybeSingle();
    if (memberError) return NextResponse.json({ error: "Yetki denetlenemedi. Tekrar dene." }, { status: 503 });
    isMember = !!member;
  }
  if (!canDownloadArchive(viewer, isMember ? [viewer.id] : [], canInspect)) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  const accepted = request.nextUrl.searchParams.get("surum") === "kabul";
  const path = accepted ? row.accepted_archive_path : row.archive_path ?? row.accepted_archive_path;
  if (!path) return NextResponse.json({ error: "Arşiv yok" }, { status: 404 });
  if (headAdminOnly && !isMember) {
    const audited = await auditHeadAdminDownload(viewer, "archive_download", { eventId: row.event_id, projectId: id, after: { version: accepted ? "kabul" : "muhur" } });
    if (!audited) return NextResponse.json({ error: "İndirme kaydı yazılamadı. Tekrar dene." }, { status: 503 });
  }
  const { data } = await db.storage.from("archives").createSignedUrl(path, 60, { download: true });
  if (!data) return NextResponse.json({ error: "Bağlantı oluşturulamadı" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
