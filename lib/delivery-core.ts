import { createHash } from "node:crypto";
import { ARCHIVE_LIMIT_BYTES } from "./delivery-policy";
import { checkZipStructure } from "./zip-check";

export type DeliveryJob = {
  id: string; project_id: string; event_id: string; kind: "submit" | "seal";
  sha: string | null; branch: string | null; repo_full_name: string | null;
  lease_token: string; attempts: number;
};

export function hashArchive(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Boyut, imza ve merkezi dizin; ardından her girdinin açılabilirliği ve CRC'si. */
export function validateArchive(bytes: Uint8Array) {
  if (bytes.byteLength > ARCHIVE_LIMIT_BYTES) throw new Error("Arşiv 50 MB sınırını aşıyor.");
  if (bytes.byteLength < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) {
    throw new Error("Geçerli bir ZIP arşivi alınamadı.");
  }
  return checkZipStructure(bytes);
}

/** Yeniden denemekle düzelmeyecek hatalar. Kayıp arşiv de buna dahildir: yönetici incelemesi gerekir. */
export function isPermanentDeliveryError(message: string) {
  // SAKLAMA: 30 günlük saklama süresi dolmuş etkinlikte mühür yeniden denenmez (Plan 5).
  return /50 MB|Geçerli bir ZIP|kabul edilmiş teslim sürümü yok|bütünlü|LOCKED|Eski mühür|depoda bulunamadı|SAKLAMA/i.test(message);
}

/**
 * Geçici hatayı (GitHub 502, depo 503) kuyruğa bırakmadan aynı kira içinde birkaç kez yeniden dener.
 * Son dakikada kuyruğa düşen iş, sonraki zamanlayıcı turunu beklerken süre dolabilir.
 * Bütçe kısa tutulur: iş işlenirken ekibin daha yeni sürümü sıraya giremez.
 */
export async function retryTransient<T>(run: () => Promise<T>, options: {
  delaysMs?: number[]; budgetMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number;
} = {}) {
  const { delaysMs = [1000, 2000], budgetMs = 20_000, sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms)), now = Date.now } = options;
  const started = now();
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (e) {
      const message = e instanceof Error ? e.message : "";
      const delay = delaysMs[attempt];
      if (delay === undefined || isPermanentDeliveryError(message) || /artık geçerli değil/.test(message)
        || now() - started + delay > budgetMs) throw e;
      await sleep(delay);
    }
  }
}

export async function captureSubmission(job: DeliveryJob, deps: {
  download: (name: string, sha: string) => Promise<Uint8Array>;
  read: (path: string) => Promise<Uint8Array | null>;
  write: (path: string, bytes: Uint8Array) => Promise<void>;
  complete: (path: string, hash: string, bytes: number) => Promise<boolean>;
}) {
  if (!job.sha || !/^[a-f0-9]{40}$/.test(job.sha) || !job.repo_full_name) throw new Error("Teslim işi geçersiz.");
  const path = `teslim/${job.id}.zip`;
  // Tekrar denemede aynı işin mevcut, değiştirilemez kopyasını kullan.
  let stored = await deps.read(path);
  if (stored) validateArchive(stored);
  else {
    const zip = await deps.download(job.repo_full_name, job.sha);
    validateArchive(zip);
    const expected = hashArchive(zip);
    await deps.write(path, zip);
    stored = await deps.read(path);
    // Hash eşitliği, depodaki baytların az önce doğrulanan baytlarla aynı olduğunu gösterir.
    if (!stored || hashArchive(stored) !== expected) throw new Error("Depolanan arşivin bütünlük kontrolü başarısız.");
  }
  return deps.complete(path, hashArchive(stored), stored.byteLength);
}

export async function verifySealedArchive(path: string, expectedHash: string, expectedBytes: number,
  read: (path: string) => Promise<Uint8Array | null>) {
  const zip = await read(path);
  if (!zip) throw new Error("Kabul edilmiş arşiv depoda bulunamadı.");
  validateArchive(zip);
  if (zip.byteLength !== expectedBytes || hashArchive(zip) !== expectedHash) {
    throw new Error("Kabul edilmiş arşivin bütünlüğü doğrulanamadı. Yönetici incelemesi gerekli.");
  }
}
