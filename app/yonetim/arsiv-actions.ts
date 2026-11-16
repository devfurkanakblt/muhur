"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { getAdminSession, getViewer } from "@/lib/data";
import { selectAll } from "@/lib/paginate";

export type RetentionActionState = { ok?: boolean; error?: string; notice?: string } | undefined;
const FRESH = "Bu işlem için son 12 saat içinde GitHub ile yeniden giriş yapmış olmalısın.";

async function headAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isHeadAdmin) return { error: "Yetkisiz" } as const;
  if (!(await getAdminSession())?.fresh) return { error: FRESH } as const;
  return { viewer } as const;
}
const dbMessage = (message: string) => message.replace(/^[\s\S]*?(SAKLAMA|YETKI):\s*/, "").split("\n")[0];

/**
 * Gerçek kuru koşum: kilitli bütün etkinliklerin manifesti DB'den okunur (salt okunur; Storage'a dokunmaz) ve özeti
 * okuyucu onayıyla birlikte kaydedilir. Bu kayıt 0021'in önkoşuludur; silmeyi açmaz.
 */
export async function confirmArchiveReaders(_: RetentionActionState, form: FormData): Promise<RetentionActionState> {
  const auth = await headAdmin(); if ("error" in auth) return { error: auth.error };
  if (form.get("confirm") !== "on") return { error: "Okuyucuların yeni sürümde olduğunu onayla." };
  const db = createAdminClient();
  let events: { id: string; slug: string }[];
  try {
    events = await selectAll<{ id: string; slug: string }>((from, to) => db.from("events").select("id, slug", { count: "exact" }).not("locked_at", "is", null).order("locked_at").order("id").range(from, to));
  } catch { return { error: "Etkinlikler okunamadı." }; }
  const items: { slug: string; objects?: number; bytes?: number; manifest_hash?: string; expires_at?: string; error?: string }[] = [];
  for (const e of events) {
    const { data, error } = await db.rpc("archive_expiry_preview", { p_event: e.id });
    items.push(error ? { slug: e.slug, error: dbMessage(error.message) } : { slug: e.slug, objects: data.objects, bytes: Number(data.bytes), manifest_hash: data.manifest_hash, expires_at: data.expires_at });
  }
  const failed = items.filter((i) => i.error);
  if (failed.length) return { error: `Kuru koşum ${failed.length} etkinlikte durdu (ör. ${failed[0].slug}: ${failed[0].error}). Onay kaydedilmedi.` };
  const summary = { generated_at: new Date().toISOString(), events: items.length, objects: items.reduce((n, i) => n + (i.objects ?? 0), 0), bytes: items.reduce((n, i) => n + (i.bytes ?? 0), 0), items };
  const { error } = await db.rpc("confirm_archive_readers", { p_actor: auth.viewer.id, p_login: auth.viewer.login, p_summary: summary, p_reason: String(form.get("reason") ?? "") });
  if (error) return { error: dbMessage(error.message) };
  revalidatePath("/yonetim");
  return { ok: true, notice: `Kuru koşum kaydedildi: ${summary.events} etkinlik, ${summary.objects} dosya. Silme kapalı kalır.` };
}

/** Süreli silmeyi aç/kapat. Açmak 0021 ve okuyucu onayı ister; kapatmak her zaman serbest ve silinenleri geri getirmez. */
export async function setArchiveRetention(_: RetentionActionState, form: FormData): Promise<RetentionActionState> {
  const auth = await headAdmin(); if ("error" in auth) return { error: auth.error };
  const enabled = form.get("enabled") === "true";
  if (enabled && form.get("confirm") !== "on") return { error: "Dosyaların geri getirilemeyecek şekilde silineceğini onayla." };
  const { error } = await createAdminClient().rpc("set_archive_retention", { p_actor: auth.viewer.id, p_login: auth.viewer.login, p_enabled: enabled, p_reason: String(form.get("reason") ?? "") });
  if (error) return { error: dbMessage(error.message) };
  revalidatePath("/yonetim");
  return { ok: true, notice: enabled ? "Süreli silme açıldı. İlk küçük partiyi kontrol et." : "Süreli silme kapatıldı; yeni claim yapılmaz." };
}
