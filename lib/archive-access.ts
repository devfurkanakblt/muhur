import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { Availability } from "@/lib/archive-retention";

export type ArchiveAccess = { state: Availability; expiresAt: string | null; secondsLeft: number | null; runState: string | null; deletedObjects: number };

/**
 * Saklama kararı DB saatine göredir (0020 archive_access). Okuma hatası "erişilebilir" sayılmaz: çağıran
 * fail-closed davranır (indirme verilmez, 503). Yetki denetiminden SONRA çağrılır; böylece yetkisiz kullanıcı
 * süresi dolmuş özel arşivin varlığını 410 üzerinden öğrenemez.
 */
export async function getArchiveAccess(eventId: string): Promise<ArchiveAccess> {
  const { data, error } = await createAdminClient().rpc("archive_access", { p_event: eventId });
  if (error || !data) throw new Error(`Saklama durumu okunamadı: ${error?.message ?? "boş yanıt"}`);
  const row = data as { state: Availability; expires_at: string | null; seconds_left: number | string | null; run_state: string | null; deleted_objects: number | string | null };
  return {
    state: row.state,
    expiresAt: row.expires_at,
    secondsLeft: row.seconds_left === null ? null : Number(row.seconds_left),
    runState: row.run_state,
    deletedObjects: Number(row.deleted_objects ?? 0),
  };
}

/** Defterden yol bazında silinme bilgisi (CSV/manifest kanıtı için). */
export async function getExpiredObjects(eventId: string): Promise<Map<string, { state: string; deletedAt: string | null }>> {
  const { data, error } = await createAdminClient().from("archive_expiry_objects").select("path, state, deleted_at").eq("event_id", eventId);
  if (error) throw new Error(`Saklama defteri okunamadı: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.path as string, { state: r.state as string, deletedAt: (r.deleted_at as string | null) ?? null }]));
}
