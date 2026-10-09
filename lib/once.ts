import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

/** İstek anahtarı: işlem adı + hedef + içerik özeti. Kullanıcıdan bağımsızdır; iki yönetici aynı isteği gönderirse de eşleşir. */
export function requestKey(action: string, ...parts: (string | number | null | undefined)[]) {
  const digest = createHash("sha256").update(parts.map((p) => String(p ?? "")).join("\u0000")).digest("hex").slice(0, 24);
  return `istek:${action}:${digest}`;
}

/**
 * Aynı isteğin süre penceresi içinde yalnızca bir kez işlenmesini sağlar (sekmeler, çift tıklama, birden çok yönetici).
 * DB'deki kira tablosunu kullanır: ilk çağrı true, pencere dolmadan gelen eşi false döner.
 * DB'ye ulaşılamazsa hata fırlatır; işlem "zaten yapıldı" sanılmaz.
 */
export async function claimOnce(key: string, seconds: number) {
  const { data, error } = await createAdminClient().rpc("try_worker_lease", { p_name: key, p_seconds: seconds });
  if (error) throw new Error(`İstek kilidi alınamadı: ${error.message}`);
  return data === true;
}

/** İşlem başarısız olduysa kilit bırakılır; kullanıcının hemen yeniden denemesi eş istek sayılmaz. */
export async function releaseOnce(key: string) {
  const { error } = await createAdminClient().from("worker_leases").delete().eq("name", key);
  if (error) console.error("[istek] kilit bırakılamadı:", error.message);
}

/** Süresi bir günden uzun süre önce dolmuş istek kilitlerini temizler (zamanlayıcıdan çağrılır). */
export async function pruneRequestKeys() {
  const { error, count } = await createAdminClient().from("worker_leases").delete({ count: "exact" })
    .like("name", "istek:%").lt("lease_until", new Date(Date.now() - 24 * 3600_000).toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}
