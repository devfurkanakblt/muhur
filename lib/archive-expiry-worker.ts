// 30 günlük arşiv saklama · süreli silme işçisi. Teslim/mühür işçisinden bağımsız: ayrı cron, ayrı kira,
// küçük süre bütçesi. Bağımlılıklar enjekte edilir (test edilebilir); üretim bağlantısı createExpiryDeps'tedir.
//
// Sıra her zaman: Storage silme (ya da açık not-found) → DB complete. Tersi (önce deleted_at) yapılmaz.
// DB tamamlama hatasında dosya silinmiş olabilir; sonraki tur aynı nesneyi not-found ile idempotent tamamlar.
// Kirayı kaybeden işçinin complete/fail çağrısı DB'de reddedilir; yeni bir dosyayı silemez çünkü yalnız
// claim ettiği (manifestteki, değişmez) yolu siler.

export type ExpiryObject = { id: string; run_id: string; event_id: string; bucket: string; path: string; lease_token: string; attempts: number };

export type ExpiryDeps = {
  enabled: () => Promise<boolean>;
  /** Vadesi geçmiş ve defteri hazırlanmamış etkinlikler. */
  dueEvents: () => Promise<string[]>;
  prepare: (eventId: string) => Promise<string>;
  claim: (limit: number) => Promise<ExpiryObject[]>;
  /** "deleted": silindi; "not_found": depoda açıkça yok (idempotent başarı). Diğer her hata fırlatır. */
  remove: (bucket: string, path: string) => Promise<"deleted" | "not_found">;
  complete: (id: string, token: string) => Promise<boolean>;
  fail: (id: string, token: string, message: string) => Promise<boolean>;
  finalize: (runId: string) => Promise<string>;
  now?: () => number;
};

export type ExpiryResult = {
  enabled: boolean;
  prepared: number;
  prepareErrors: string[];
  deleted: number;
  notFound: number;
  failed: number;
  lostLease: number;
  completeErrors: number;
  finalized: Record<string, string>;
};

const SAFE_PATH = /^(teslim\/[0-9a-f-]{36}\.zip|ara-muhur\/[a-z0-9-]{3,40}\/[0-9]{3,}-[0-9a-f]{7}\.zip)$/;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export async function runArchiveExpiry(deps: ExpiryDeps, { budgetMs = 20_000, batch = 10 } = {}): Promise<ExpiryResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const result: ExpiryResult = { enabled: false, prepared: 0, prepareErrors: [], deleted: 0, notFound: 0, failed: 0, lostLease: 0, completeErrors: 0, finalized: {} };
  if (!(await deps.enabled())) return result;
  result.enabled = true;

  // Hazırlık Storage'a dokunmaz; manifest eksik/kapsam dışıysa o etkinlik için hata kaydedilir, diğerleri sürer.
  for (const eventId of await deps.dueEvents()) {
    try { await deps.prepare(eventId); result.prepared++; }
    catch (e) { result.prepareErrors.push(`${eventId}: ${message(e)}`); }
  }

  const runs = new Set<string>();
  while (now() - started < budgetMs) {
    const objects = await deps.claim(batch);
    if (!objects.length) break;
    for (const o of objects) {
      runs.add(o.run_id);
      // Savunma: yalnız arşiv deposu ve uygulamanın ürettiği yollar. DB zaten kısıtlar; burada ikinci kez.
      if (o.bucket !== "archives" || !SAFE_PATH.test(o.path)) {
        await deps.fail(o.id, o.lease_token, "Kapsam dışı yol; silinmedi.").catch(() => false);
        result.failed++;
        continue;
      }
      let outcome: "deleted" | "not_found";
      try {
        outcome = await deps.remove(o.bucket, o.path);
      } catch (e) {
        // 429/5xx/erişim hatası "bulunamadı" sayılmaz: yeniden denenir, sınırdan sonra terminal.
        const ok = await deps.fail(o.id, o.lease_token, message(e)).catch(() => false);
        if (ok) result.failed++; else result.lostLease++;
        continue;
      }
      try {
        const ok = await deps.complete(o.id, o.lease_token);
        if (!ok) { result.lostLease++; continue; }
        if (outcome === "deleted") result.deleted++; else result.notFound++;
      } catch {
        // Dosya silinmiş olabilir; kira dolunca nesne geri alınır ve not-found ile tamamlanır.
        result.completeErrors++;
      }
    }
  }
  for (const run of runs) {
    try { result.finalized[run] = await deps.finalize(run); } catch (e) { result.finalized[run] = `hata: ${message(e)}`; }
  }
  return result;
}
