/**
 * Kimlik ve yetki kararları. Yalnızca sunucunun yönettiği GitHub kimlik kaydına (`identities`) dayanır.
 * `user_metadata` kullanıcı tarafından güncellenebildiği için yetki kaynağı olarak KULLANILMAZ (denetim A01/A02).
 */

type Identity = {
  provider?: string;
  id?: string;
  identity_data?: Record<string, unknown> | null;
};

export type AuthUserLike = {
  id: string;
  identities?: Identity[] | null;
};

export type GithubIdentity = { githubId: string; login: string; avatarUrl: string | null };

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : typeof v === "number" ? String(v) : null);

/** GitHub sağlayıcısıyla bağlanmış kimlik; yoksa null (başka sağlayıcıyla açılmış hesaplar GitHub kimliği taşımaz). */
export function githubIdentity(user: AuthUserLike): GithubIdentity | null {
  const identity = (user.identities ?? []).find((i) => i.provider === "github");
  if (!identity) return null;
  const data = identity.identity_data ?? {};
  const githubId = str(data.provider_id) ?? str(data.sub) ?? str(identity.id);
  if (!githubId || !/^\d+$/.test(githubId)) return null;
  return {
    githubId,
    login: str(data.user_name) ?? str(data.preferred_username) ?? "",
    avatarUrl: str(data.avatar_url),
  };
}

/** Yönetici: sabit sayısal GitHub kimliği yönetici listesinde olan GitHub hesabı. Kullanıcı adı yetki vermez. */
export function isAdminIdentity(identity: GithubIdentity | null, adminGithubIds: string[]) {
  return !!identity && adminGithubIds.includes(identity.githubId);
}

/** Geri alınamaz yönetim işlemleri için oturumun en fazla bu kadar önce açılmış olması gerekir (denetim A21). */
export const ADMIN_REAUTH_MS = 12 * 3600_000;

/**
 * Bu oturumun GitHub ile açıldığı an (ms). Doğrulanmış JWT'nin `amr` kaydından okunur; oturum tazelense de
 * değişmez, başka bir cihazdaki giriş de bu oturumu tazelemez. Kayıt yoksa null.
 */
export function sessionSignedInAt(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  const times = amr
    .filter((e): e is { method: string; timestamp: number } =>
      !!e && typeof e === "object" && e.method === "oauth" && typeof e.timestamp === "number" && Number.isFinite(e.timestamp))
    .map((e) => e.timestamp * 1000);
  return times.length ? Math.max(...times) : null;
}

/** Oturum, geri alınamaz işlemler için yeterince yeni mi. Gelecekteki zaman damgası da reddedilir. */
export function isFreshSignIn(signedInAt: number | null, now: number, windowMs = ADMIN_REAUTH_MS) {
  return signedInAt !== null && signedInAt <= now + 60_000 && now - signedInAt < windowMs;
}

/**
 * Repo sahiplenme kararı (saf). Repo sahibi sabit kimlikle eşleşiyorsa ya da kullanıcının kendi token'ı
 * (token sahibi = oturumdaki kişi) repoya push yetkisi gösteriyorsa izin verilir.
 */
export function claimDecision(input: {
  ownerId: string | number;
  githubId: string;
  tokenUserId?: string | number | null;
  tokenCanPush?: boolean | null;
}): "owner" | "collaborator" | "token-required" | "denied" {
  if (String(input.ownerId) === input.githubId) return "owner";
  if (input.tokenUserId == null) return "token-required";
  if (String(input.tokenUserId) !== input.githubId) return "denied";
  return input.tokenCanPush ? "collaborator" : "denied";
}
