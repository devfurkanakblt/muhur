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
