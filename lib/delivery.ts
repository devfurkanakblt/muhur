import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { downloadZipball } from "@/lib/github";
import { captureSubmission, isPermanentDeliveryError, retryTransient, verifySealedArchive, type DeliveryJob } from "@/lib/delivery-core";

async function readArchive(path: string) {
  const { data, error } = await createAdminClient().storage.from("archives").download(path);
  if (error) {
    if (/not found|not exist|404/i.test(error.message)) return null;
    throw new Error("Arşiv deposuna ulaşılamadı.");
  }
  return new Uint8Array(await data!.arrayBuffer());
}

/** Proje silindiyse, kira kaybedildiyse ya da süre dolduysa çalışan iş depoya dosya bırakmaz. */
async function assertJobWritable(job: DeliveryJob) {
  const { data, error } = await createAdminClient().rpc("delivery_job_state", { p_job: job.id, p_token: job.lease_token });
  if (error) throw new Error(error.message);
  if (data === "locked") throw new Error("LOCKED: Teslim süresi doldu; arşiv yazılmadı.");
  if (data !== "ok") throw new Error("Teslim işi artık geçerli değil.");
}

/** Güncel kabul ve mühür dışında en yeni üç eski kabul arşivi tutulur. Kayıtlar kanıt olarak kalır. */
export async function pruneAcceptedArchives(projectId: string) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("prune_submission_archives", { p_project: projectId, p_keep: 3 });
  if (error) throw new Error(error.message);
  const paths = (data ?? []) as string[];
  // Dosya silinemezse kayıt budanmış olarak işaretli kalır; depo temizliği daha sonra yeniden dener.
  if (paths.length) await db.storage.from("archives").remove(paths);
  return paths.length;
}

export async function processDeliveryJobs(projectId: string | null = null, limit = 4) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_delivery_jobs", { p_project: projectId, p_limit: limit });
  if (error) throw new Error(error.message);
  const jobs = (data ?? []) as DeliveryJob[];
  const outcomes = await Promise.all(jobs.map(async (job) => {
    try {
      let completed: boolean;
      if (job.kind === "submit") {
        completed = await retryTransient(() => captureSubmission(job, {
          read: readArchive,
          download: downloadZipball,
          write: async (path, bytes) => {
            await assertJobWritable(job);
            const { error } = await db.storage.from("archives").upload(path, bytes, { contentType: "application/zip", upsert: false });
            if (error) throw new Error(error.message);
          },
          complete: async (path, hash, bytes) => {
            const { data, error } = await db.rpc("complete_submission", {
              p_job: job.id, p_token: job.lease_token, p_path: path, p_hash: hash, p_bytes: bytes,
            });
            if (error) throw new Error(error.message);
            return data === true;
          },
        }));
      } else {
        const { data: p, error: projectError } = await db.from("projects").select(
          "accepted_archive_path, accepted_archive_sha256, accepted_archive_bytes, archive_sha256",
        ).eq("id", job.project_id).single();
        if (projectError || !p) throw new Error("Proje okunamadı.");
        if (!p.archive_sha256) {
          // Süresi dolmuş etkinlikte ZIP yeniden yüklenmez, GitHub'dan güncel HEAD arşivlenmez; hata nedeni saklamadır.
          const { data: expired, error: expiryError } = await db.rpc("archive_expired", { p_event: job.event_id });
          if (expiryError) throw new Error("Saklama durumu okunamadı.");
          if (expired === true) throw new Error("SAKLAMA: Arşivin 30 günlük saklama süresi doldu; mühür yeniden oluşturulamaz.");
          if (!p.accepted_archive_path) throw new Error("Süre dolmadan kabul edilmiş teslim sürümü yok. Sonradan kod kabul edilemez.");
          await retryTransient(() => verifySealedArchive(p.accepted_archive_path, p.accepted_archive_sha256, p.accepted_archive_bytes, readArchive));
        }
        const { data, error } = await db.rpc("complete_seal", { p_job: job.id, p_token: job.lease_token });
        if (error) throw new Error(error.message);
        completed = data === true;
      }
      if (completed && job.kind === "submit") {
        await pruneAcceptedArchives(job.project_id).catch((e) => console.error("[teslim] budama:", e instanceof Error ? e.message : e));
      }
      return { id: job.id, projectId: job.project_id, ok: completed };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Arşiv işlemi tamamlanamadı.";
      const permanent = isPermanentDeliveryError(message);
      const { error } = await db.rpc("fail_delivery_job", {
        p_job: job.id, p_token: job.lease_token, p_error: message, p_retry: !permanent,
      });
      if (error) throw new Error(error.message);
      return { id: job.id, projectId: job.project_id, ok: false, message, retry: !permanent };
    }
  }));
  return outcomes;
}

/** Son 15 dakikada geçici hatadan sonra bekleme en fazla 10 sn (0006); takip denemesi bunun hemen ardından yapılır. */
const FOLLOW_UP_MS = 11_000;

/**
 * Teslim isteğinden sonra (after) çalışır: geçici hatayla sıraya dönen iş, dakikalık zamanlayıcıyı beklemeden
 * yeniden denenir. Son tarih uzaktaysa bekleme daha uzundur; takip turu iş bulamaz ve durur.
 */
export async function processProjectJobs(projectId: string) {
  for (let round = 0; round < 4; round++) {
    const outcomes = await processDeliveryJobs(projectId);
    if (!outcomes.some((o) => "retry" in o && o.retry)) return outcomes;
    await new Promise((resolve) => setTimeout(resolve, FOLLOW_UP_MS));
  }
}

/**
 * Kuyruk boşalana ya da süre bütçesi bitene kadar işler. Kilitten sonra bütün mühürler
 * dakikada birkaç iş yerine ilk zamanlayıcı turunda tamamlanır.
 */
export async function drainDeliveryJobs(budgetMs: number) {
  const started = Date.now();
  const outcomes: Awaited<ReturnType<typeof processDeliveryJobs>> = [];
  while (Date.now() - started < budgetMs) {
    const batch = await processDeliveryJobs(null, 8);
    if (!batch.length) break;
    outcomes.push(...batch);
  }
  return outcomes;
}

export async function enqueueSeals(eventId: string) {
  const { error } = await createAdminClient().rpc("enqueue_seals", { p_event: eventId });
  if (error) throw new Error(error.message);
}

export async function retrySeal(projectId: string, eventId: string) {
  const db = createAdminClient();
  const { data: job, error: readError } = await db.from("delivery_jobs").select("id").eq("project_id", projectId)
    .eq("event_id", eventId).eq("kind", "seal").eq("state", "failed").maybeSingle();
  if (readError) throw new Error(readError.message);
  if (job) {
    const { error } = await db.rpc("retry_delivery_job", { p_job: job.id });
    if (error) throw new Error(error.message);
  }
  await enqueueSeals(eventId);
  return processDeliveryJobs(projectId);
}
