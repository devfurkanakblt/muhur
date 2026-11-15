// Saf yetki kararları: bağımlılıksız, veritabanı ya da oturum bilmez.
// DB tarafındaki kurallarla (YETKI:/ASKIDA: önekleri) aynı sonucu verir.

export type CommunityRole = "owner" | "organizator";

export type EventAccess = {
  headAdmin: boolean;
  communityRole: CommunityRole | null;
  juror: boolean;
  eventSuspended: boolean;
  communitySuspended: boolean;
  locked: boolean;
  /** Rol var ama güncel yönetim belgeleri onaylanmamış (zorunluluk açıkken). Rol bilgisi başkasına açılmaz. */
  policyPending?: boolean;
};

export type EventAction = "yonet" | "isletim" | "incele" | "juri-paketi" | "askiya-al" | "anonimlestir";

export const YETKISIZ_MESAJI = "Yetkisiz";
export const ASKIDA_MESAJI = "Bu etkinlik platform tarafından geçici olarak durduruldu.";
export const ONAY_MESAJI = "Yönetim işlemleri için güncel platform belgelerini topluluk adına onaylaman gerekiyor.";
export const YARISAMAZ_MESAJI = "Bu etkinlikte organizatör ya da jürisin; yarışmaya katılamazsın.";

export function can(access: EventAccess | null, action: EventAction): boolean {
  if (!access) return false;
  const rolVar = access.communityRole !== null;
  const incele = access.headAdmin || rolVar;
  switch (action) {
    case "yonet":
      return rolVar && !access.eventSuspended && !access.communitySuspended && !access.policyPending;
    case "isletim":
    case "incele":
      return incele;
    case "juri-paketi":
      return incele || (access.juror && access.locked);
    case "askiya-al":
    case "anonimlestir":
      return access.headAdmin;
  }
}

export function denialMessage(access: EventAccess | null, action: EventAction): string {
  if (!access) return YETKISIZ_MESAJI;
  // Askı yokken yapılabilecek bir işse, reddin tek sebebi askıdır.
  if (access.eventSuspended || access.communitySuspended) {
    if (can({ ...access, eventSuspended: false, communitySuspended: false }, action)) return ASKIDA_MESAJI;
  }
  // Rolü olan ama güncel belgeyi onaylamamış kişiye Yetkisiz yerine neyin eksik olduğu söylenir.
  if (access.policyPending && can({ ...access, policyPending: false }, action)) return ONAY_MESAJI;
  return YETKISIZ_MESAJI;
}
