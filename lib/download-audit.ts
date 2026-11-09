import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { EventAccess } from "@/lib/authz";

/** İndirme yetkisi yalnızca head admin olmaktan mı geliyor? (topluluk rolü ya da kilit sonrası jüri değil) */
export function isHeadAdminOnly(access: EventAccess | null): boolean {
  return !!access && access.headAdmin && !access.communityRole && !(access.juror && access.locked);
}

/**
 * Head admin'in başka topluluğun etkinliğindeki indirmesini denetim kaydına yazar.
 * Kayıt yazılamazsa false döner; çağıran indirmeyi vermez (kapalı başarısızlık).
 */
export async function auditHeadAdminDownload(
  viewer: { id: string; login: string },
  action: "archive_download" | "jury_package_download",
  fields: { eventId: string; projectId?: string; after?: Record<string, unknown> },
): Promise<boolean> {
  const { error } = await createAdminClient().rpc("log_admin", {
    p_actor: viewer.id, p_login: viewer.login, p_action: action,
    p_event: fields.eventId, p_project: fields.projectId ?? null, p_after: fields.after ?? null,
  });
  if (error) console.error(`[denetim] ${action} kaydedilemedi:`, error.message);
  return !error;
}
