import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/server";
import { canDownloadArchive } from "@/lib/delivery-policy";

/**
 * Arşiv: adminler ve eserin kendi ekibi indirebilir. Mühürlü arşiv varsa o; yoksa (ya da ?surum=kabul ile)
 * süre dolmadan kabul edilmiş son teslim arşivi. Ekip kilitten önce kendi teslimini indirip doğrulayabilir.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/arsiv/[id]">) {
  const { id } = await ctx.params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Arşiv yok" }, { status: 404 });
  const db = createAdminClient();
  if (!viewer.isAdmin) {
    const { data: member, error } = await db.from("project_members").select("user_id").eq("project_id", id).eq("user_id", viewer.id).maybeSingle();
    if (error) return NextResponse.json({ error: "Yetki denetlenemedi. Tekrar dene." }, { status: 503 });
    if (!canDownloadArchive(viewer, member ? [member.user_id] : [])) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }
  const { data: row, error } = await db.from("projects").select("archive_path, accepted_archive_path").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Arşiv kaydı okunamadı. Tekrar dene." }, { status: 503 });
  const accepted = request.nextUrl.searchParams.get("surum") === "kabul";
  const path = accepted ? row?.accepted_archive_path : row?.archive_path ?? row?.accepted_archive_path;
  if (!path) return NextResponse.json({ error: "Arşiv yok" }, { status: 404 });
  const { data } = await db.storage.from("archives").createSignedUrl(path, 60, { download: true });
  if (!data) return NextResponse.json({ error: "Bağlantı oluşturulamadı" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
