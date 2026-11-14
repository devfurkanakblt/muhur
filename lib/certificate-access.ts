import "server-only";
import { getOwnProject, type EventState, type Viewer } from "@/lib/data";
import { getEventAccess } from "@/lib/access";
import { can } from "@/lib/authz";

export type CertificateAccess = "giris" | "katilimci-degil" | "izinli";

/**
 * Katılım belgesini yalnızca GitHub ile giriş yapmış ve bu etkinlikte bir ekibe üye olan kişi alır.
 * Etkinliği inceleme yetkisi olan (topluluk rolü, head admin), belgeyi denetleyebilmek için ekipsiz de alabilir.
 */
export async function certificateAccess(viewer: Viewer | null, event: EventState): Promise<CertificateAccess> {
  if (!viewer) return "giris";
  if (can(await getEventAccess(viewer, event), "incele")) return "izinli";
  return (await getOwnProject(viewer.id, event.id)) ? "izinli" : "katilimci-degil";
}
