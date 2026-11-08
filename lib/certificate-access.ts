import "server-only";
import { getOwnProject, type EventState, type Viewer } from "@/lib/data";

export type CertificateAccess = "giris" | "katilimci-degil" | "izinli";

/**
 * Katılım belgesini yalnızca GitHub ile giriş yapmış ve bu etkinlikte bir ekibe üye olan kişi alır.
 * Yönetici, belgeyi denetleyebilmek için ekipsiz de alabilir.
 */
export async function certificateAccess(viewer: Viewer | null, event: EventState): Promise<CertificateAccess> {
  if (!viewer) return "giris";
  if (viewer.isAdmin) return "izinli";
  return (await getOwnProject(viewer.id, event.id)) ? "izinli" : "katilimci-degil";
}
