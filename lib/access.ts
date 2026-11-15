import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import { getViewer, type EventState, type Viewer } from "@/lib/data";
import { getManagementConsent } from "@/lib/policy-data";
import { can, denialMessage, type CommunityRole, type EventAccess, type EventAction } from "@/lib/authz";

/**
 * Görüntüleyenin bu etkinlikteki yetki girdileri (head admin, topluluk rolü, jüri, askı, kilit).
 * Asıl zorlama veritabanındadır (YETKI:/ASKIDA:); bu kontrol doğru arayüzü verir ve RPC'ye gitmeyen
 * yolları (arşiv, jüri paketi, belge, doğrudan tablo yazmaları) korur.
 */
export const getEventAccess = cache(async (viewer: Viewer | null, event: EventState): Promise<EventAccess | null> => {
  if (!viewer) return null;
  const db = createAdminClient();
  const [membership, juror] = await Promise.all([
    event.communityId
      ? db.from("community_members").select("role").eq("community_id", event.communityId).eq("user_id", viewer.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from("event_jurors").select("user_id").eq("event_id", event.id).eq("user_id", viewer.id).maybeSingle(),
  ]);
  // Okuma hatası "yetki yok" gibi gösterilmez; sayfa hata ekranına düşer.
  if (membership.error || juror.error) {
    console.error("[yetki] okunamadı:", (membership.error ?? juror.error)?.message);
    throw new Error("Yetki bilgisi okunamadı. Lütfen biraz sonra tekrar dene.");
  }
  const role = membership.data?.role;
  const communityRole = role === "owner" || role === "organizator" ? (role as CommunityRole) : null;
  // Onay durumu yalnız rolü olan için okunur; DB her yönetim yazmasında aynı kuralı ayrıca uygular.
  const policyPending = communityRole && event.communityId ? (await getManagementConsent(viewer.id, event.communityId)).blocking : false;
  return {
    headAdmin: viewer.isHeadAdmin,
    communityRole,
    juror: !!juror.data,
    eventSuspended: event.suspended,
    communitySuspended: event.communityStatus === "askida",
    locked: event.locked,
    policyPending,
  };
});

/** İzin yoksa Türkçe mesajla `Error` fırlatır; izin varsa görüntüleyeni döndürür. */
export async function requireEventAction(event: EventState, action: EventAction): Promise<Viewer> {
  const viewer = await getViewer();
  const access = await getEventAccess(viewer, event);
  if (!viewer || !can(access, action)) throw new Error(denialMessage(access, action));
  return viewer;
}
