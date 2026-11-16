import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { selectAll } from "@/lib/paginate";
import { runArchiveExpiry, type ExpiryDeps, type ExpiryObject } from "@/lib/archive-expiry-worker";

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

/** Üretim bağımlılıkları: DB RPC'leri (0020) ve Supabase Storage. */
export function createExpiryDeps(): ExpiryDeps {
  const db = createAdminClient();
  return {
    enabled: async () => check(await db.rpc("archive_retention_enabled"), "Saklama ayarı") === true,
    dueEvents: async () => {
      const [events, runs] = await Promise.all([
        selectAll<{ id: string }>((from, to) => db.from("events").select("id", { count: "exact" })
          .lte("archive_expires_at", new Date().toISOString()).order("archive_expires_at").order("id").range(from, to)),
        selectAll<{ event_id: string }>((from, to) => db.from("archive_expiry_runs").select("event_id", { count: "exact" }).order("event_id").range(from, to)),
      ]);
      const prepared = new Set(runs.map((r) => r.event_id));
      return events.map((e) => e.id).filter((id) => !prepared.has(id));
    },
    prepare: async (eventId) => check(await db.rpc("prepare_archive_expiry", { p_event: eventId }), "Defter hazırlığı") as string,
    claim: async (limit) => (check(await db.rpc("claim_archive_expiry_objects", { p_limit: limit }), "Claim") ?? []) as ExpiryObject[],
    // Storage remove, olmayan nesne için hatasız boş liste döner: bu açık not-found sonucudur. Hata (429/5xx/erişim)
    // not-found sayılmaz ve fırlatılır.
    remove: async (bucket, path) => {
      const { data, error } = await db.storage.from(bucket).remove([path]);
      if (error) throw new Error(`Storage silme: ${error.message}`);
      return (data ?? []).length > 0 ? "deleted" : "not_found";
    },
    complete: async (id, token) => check(await db.rpc("complete_archive_expiry_object", { p_id: id, p_token: token }), "Tamamlama") === true,
    fail: async (id, token, message) => check(await db.rpc("fail_archive_expiry_object", { p_id: id, p_token: token, p_error: message }), "Hata kaydı") === true,
    finalize: async (runId) => check(await db.rpc("finalize_archive_expiry", { p_run: runId }), "Kapanış") as string,
  };
}

/**
 * Cron girişi: kendi kirası ("arsiv-saklama") altında, teslim/mühür işçisinden bağımsız ve kısa bütçeyle.
 * Ayar kapalıyken (varsayılan; 0021 + head admin aktivasyonu gerekir) hiçbir şey hazırlamaz ve silmez.
 */
export async function archiveExpiryTick() {
  const db = createAdminClient();
  const lease = check(await db.rpc("try_worker_lease", { p_name: "arsiv-saklama", p_seconds: 90 }), "Kira");
  if (lease !== true) return { skipped: "kira" };
  const result = await runArchiveExpiry(createExpiryDeps(), { budgetMs: 20_000, batch: 10 });
  if (result.enabled && (result.deleted || result.notFound || result.failed || result.prepareErrors.length || result.completeErrors)) {
    await db.rpc("log_admin", { p_actor: null, p_login: "zamanlayıcı", p_action: "archive_expiry_tick", p_after: result });
  }
  return result;
}
