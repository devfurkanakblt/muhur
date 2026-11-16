import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { downloadZipball, getHeadSha, getRepoById, GithubError, hasCommitsBefore } from "@/lib/github";
import { notifyEvent, tg } from "@/lib/notify";
import { env } from "@/lib/env";
import { eventUrl } from "@/lib/event-routes";
import { drainDeliveryJobs, enqueueSeals, processDeliveryJobs } from "@/lib/delivery";
import { sendReminders } from "@/lib/reminders";
import { hashArchive, validateArchive } from "@/lib/delivery-core";
import { sweepStorage } from "@/lib/storage-sweep";
import { claimOnce, pruneRequestKeys } from "@/lib/once";

type EventRow = { id: string; slug: string; title: string; starts_at: string; deadline: string; locked_at: string | null; telegram: boolean };
type Row = {
  id: string;
  event_id: string;
  exhibit_no: number;
  name: string;
  team_name: string;
  repo_id: number;
  repo_full_name: string;
  frozen_sha: string | null;
};

const ROW = "id, event_id, exhibit_no, name, team_name, repo_id, repo_full_name, frozen_sha";
const ARCHIVE_LIMIT_KB = 50 * 1024;
/** Ara mühürler son teslimden bu kadar önce başlar ve bu aralıkla tekrarlanır. */
const SNAPSHOT_WINDOW_MS = 3 * 3600_000;
const SNAPSHOT_EVERY_MS = 25 * 60_000;

const no = (n: number) => String(n).padStart(3, "0");

const EVENT_COLUMNS = "id, slug, title, starts_at, deadline, locked_at";
/** Topluluğun Telegram izni; topluluğu okunamayan etkinlik bildirim göndermez. */
function withTelegram<T extends { community?: { telegram_enabled: boolean } | { telegram_enabled: boolean }[] | null }>(row: T): Omit<T, "community"> & { telegram: boolean } {
  const { community, ...rest } = row;
  const c = Array.isArray(community) ? community[0] : community;
  return { ...rest, telegram: c?.telegram_enabled === true };
}

async function getEventRow(eventId: string) {
  const db = createAdminClient();
  const { data, error } = await db.from("events").select(`${EVENT_COLUMNS}, community:communities(telegram_enabled)`).eq("id", eventId).single();
  if (error || !data) throw new Error("Etkinlik bulunamadı.");
  return withTelegram(data);
}

// ---------------------------------------------------------------------------- kilit

/** Son tarih geçtiyse ve kilit kaydı yoksa kilidi kalıcı olarak yazar. */
export async function ensureLocked(eventId: string, by: string) {
  const db = createAdminClient();
  const ev = await getEventRow(eventId);
  if (ev.locked_at) return true;
  const { data, error } = await db.rpc("lock_delivery_event", { p_event: eventId, p_by: by, p_force: false });
  if (error) throw new Error(error.message);
  if (data === true) await announceLock(ev, new Date(ev.deadline));
  return data === true;
}

/** Yönetici kilidi: kilit ve aktörlü denetim kaydı aynı transaction içinde yazılır. */
export async function lockNow(eventId: string, actor: { id: string; login: string }) {
  const db = createAdminClient();
  const before = await getEventRow(eventId);
  const { data, error } = await db.rpc("admin_lock_event", { p_event: eventId, p_actor: actor.id, p_login: actor.login });
  if (error) throw new Error(error.message);
  if (data === true && !before.locked_at) {
    const event = await getEventRow(eventId);
    await announceLock(event, new Date(event.locked_at!));
  }
}

async function announceLock(ev: EventRow, at: Date) {
  // Cron ve yönetici aynı anda kilitlese de mühür duyurusu etkinlik başına bir kez gider.
  if (!(await claimOnce(`istek:muhur-duyurusu:${ev.id}`, 30 * 24 * 3600))) return;
  const db = createAdminClient();
  const { count } = await db.from("projects").select("id", { count: "exact", head: true }).eq("event_id", ev.id);
  const time = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(at);
  await notifyEvent(ev, [`🔒 ${tg.b("Mühür vuruldu.")}`, `${tg.text(ev.title)} · ${count ?? 0} eser · ${time}`, tg.link(eventUrl(env.siteUrl, ev.slug), "Vitrine bak")], "muhur");
}

// ---------------------------------------------------------------------------- arşiv

async function storeZip(path: string, zip: Uint8Array) {
  validateArchive(zip);
  const db = createAdminClient();
  const { error } = await db.storage.from("archives").upload(path, zip, { contentType: "application/zip", upsert: false });
  if (error && !/exists/i.test(error.message)) throw new Error(error.message);
  const stored = await db.storage.from("archives").download(path);
  if (stored.error || !stored.data || hashArchive(new Uint8Array(await stored.data.arrayBuffer())) !== hashArchive(zip)) {
    throw new Error("Ara arşivin bütünlüğü doğrulanamadı.");
  }
}

/** Yalnızca süre dolmadan doğrulanmış teslimler mühürlenir. */
export async function freezeAll(eventId: string) {
  await enqueueSeals(eventId);
  return drainDeliveryJobs(SEAL_DRAIN_MS);
}

export type SnapshotResult = { attempted: number; stored: number; unchanged: number; skipped: number; failed: number; lastError: string | null };

/** Ara kopyalar inceleme içindir; kabul edilmiş teslimin yerine geçmez. */
export async function takeSnapshots(ev: EventRow, limit = 6): Promise<SnapshotResult> {
  const db = createAdminClient();
  const now = Date.now();
  const deadline = new Date(ev.deadline).getTime();
  const result: SnapshotResult = { attempted: 0, stored: 0, unchanged: 0, skipped: 0, failed: 0, lastError: null };
  if (ev.locked_at || now >= deadline || now < deadline - SNAPSHOT_WINDOW_MS) return result;

  const { data: projects, error: projectError } = await db.from("projects").select(ROW).eq("event_id", ev.id).order("exhibit_no");
  if (projectError) throw new Error(projectError.message);
  const { data: snaps, error: snapError } = await db.from("snapshots").select("project_id, last_seen_at").in("project_id", (projects ?? []).map((p) => p.id));
  if (snapError) throw new Error(snapError.message);
  const lastSeen = new Map<string, number>();
  for (const s of snaps ?? []) lastSeen.set(s.project_id, Math.max(lastSeen.get(s.project_id) ?? 0, new Date(s.last_seen_at).getTime()));
  const due = ((projects ?? []) as Row[])
    .filter((p) => now - (lastSeen.get(p.id) ?? 0) >= SNAPSHOT_EVERY_MS)
    .sort((a, b) => (lastSeen.get(a.id) ?? 0) - (lastSeen.get(b.id) ?? 0))
    .slice(0, limit);

  result.attempted = due.length;
  await Promise.all(
    due.map(async (p) => {
      try {
        const repo = await getRepoById(p.repo_id);
        if (repo.private) { result.skipped++; return; }
        const sha = await getHeadSha(repo);
        if (!sha) { result.skipped++; return; }
        const seen = await db.from("snapshots").update({ last_seen_at: new Date().toISOString() }).eq("project_id", p.id).eq("sha", sha).select("id");
        if (seen.error) throw new Error(seen.error.message);
        if (seen.data?.length) { result.unchanged++; return; }
        const zip = await downloadZipball(repo.full_name, sha);
        const path = `ara-muhur/${ev.slug}/${no(p.exhibit_no)}-${sha.slice(0, 7)}.zip`;
        await storeZip(path, zip);
        const { error: snapshotError } = await db.from("snapshots").insert({
          project_id: p.id,
          sha,
          archive_path: path,
          archive_bytes: zip.byteLength,
          archive_sha256: createHash("sha256").update(zip).digest("hex"),
        });
        if (snapshotError) throw new Error(snapshotError.message);
        result.stored++;
        await db.from("project_timeline").insert({ project_id: p.id, kind: "snapshot", detail: sha });
        // Depoyu şişirmemek için eser başına yalnızca son iki ara mühür tutulur.
        const { data: old } = await db.from("snapshots").select("id, archive_path").eq("project_id", p.id).order("last_seen_at", { ascending: false }).range(2, 50);
        if (old?.length) {
          await db.storage.from("archives").remove(old.map((o) => o.archive_path));
          await db.from("snapshots").delete().in("id", old.map((o) => o.id));
        }
      } catch (e) {
        // Ara mühür başarısız olursa bir sonraki turda yeniden denenir; hata zamanlayıcı kaydında görünür.
        result.failed++;
        result.lastError = `No. ${no(p.exhibit_no)}: ${e instanceof Error ? e.message : "bilinmeyen hata"}`.slice(0, 300);
      }
    }),
  );
  return result;
}

// ---------------------------------------------------------------------------- sağlık

export type HealthIssue = "erisilemiyor" | "bos" | "buyuk" | "cok-buyuk";

export async function checkHealth(p: Row, ev: EventRow) {
  const db = createAdminClient();
  const locked = !!ev.locked_at || Date.now() >= new Date(ev.deadline).getTime();
  const issues: HealthIssue[] = [];
  const fields: Record<string, unknown> = { health_checked_at: new Date().toISOString() };
  try {
    const repo = await getRepoById(p.repo_id);
    if (repo.private) issues.push("erisilemiyor");
    else {
      const head = await getHeadSha(repo);
      if (!head) issues.push("bos");
      if (repo.size > ARCHIVE_LIMIT_KB * 0.8) issues.push("buyuk");
      fields.repo_head_sha = head;
      fields.pre_event_commits = await hasCommitsBefore(repo, ev.starts_at);
    }
    Object.assign(fields, { repo_size_kb: repo.size, repo_created_at: repo.created_at, last_pushed_at: repo.pushed_at });
    // Yeniden adlandırılan repoyu kilitten önce sessizce izle.
    if (!locked) Object.assign(fields, { repo_full_name: repo.full_name, repo_url: repo.html_url, default_branch: repo.default_branch });
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) issues.push("erisilemiyor");
    else throw e; // Geçici hata zamanlayıcı kaydına yazılır.
  }
  fields.health_issues = issues;
  const { error } = await db.from("projects").update(fields).eq("id", p.id);
  if (error) throw new Error(error.message);
}

/** Eserleri sırayla kontrol eder; son saatte daha sık. */
export async function checkHealthDue(ev: EventRow, limit = 8) {
  const db = createAdminClient();
  const now = Date.now();
  const lastHour = new Date(ev.deadline).getTime() - now < 3600_000;
  const staleBefore = new Date(now - (lastHour ? 3 : 10) * 60_000).toISOString();
  const { data, error } = await db
    .from("projects")
    .select(ROW)
    .eq("event_id", ev.id)
    .or(`health_checked_at.is.null,health_checked_at.lt.${staleBefore}`)
    .order("health_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  const results = await Promise.allSettled(((data ?? []) as Row[]).map((p) => checkHealth(p, ev)));
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  return {
    checked: results.length - failures.length,
    failed: failures.length,
    lastError: failures.length ? String(failures[0].reason instanceof Error ? failures[0].reason.message : failures[0].reason).slice(0, 300) : null,
  };
}

// ---------------------------------------------------------------------------- zamanlayıcı

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** Yardımcı işler (sağlık, ara mühür, hatırlatma, depo temizliği) bu süreden sonra başlatılmaz. */
const HELPER_BUDGET_MS = 35_000;
/** Kilitten sonra mühür kuyruğu bu süre boyunca boşaltılır; pg_cron isteğinin 60 sn zaman aşımının altında kalır. */
const SEAL_DRAIN_MS = 40_000;

async function tryLease(name: string, seconds: number) {
  const { data, error } = await createAdminClient().rpc("try_worker_lease", { p_name: name, p_seconds: seconds });
  if (error) throw new Error(error.message);
  return data === true;
}

/**
 * Dakikada bir. Kritik akış önce ve yardımcılardan bağımsız: teslim kuyruğu, kilit ve mühür kuyruğu, mühür işleri.
 * Yardımcı işler kira altında, ayrı hata yakalamayla ve süre bütçesiyle çalışır; hataları çalışma kaydına yazılır.
 */
export async function tick() {
  const started = Date.now();
  const db = createAdminClient();
  const { data: run, error: runError } = await db.from("worker_runs").insert({}).select("id").single();
  if (runError || !run) throw new Error("Zamanlayıcı çalışma kaydı oluşturulamadı.");
  const errors: string[] = [];
  const details: Record<string, unknown> = {};
  const step = async <T,>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try { return await fn(); } catch (e) { errors.push(`${name}: ${message(e)}`); return undefined; }
  };
  const withinBudget = () => Date.now() - started < HELPER_BUDGET_MS;
  try {
    const { data: rows, error } = await db.from("events").select(`${EVENT_COLUMNS}, community:communities(telegram_enabled)`);
    if (error) throw new Error(error.message);
    const events = (rows ?? []).map(withTelegram);

    let processed = (await step("teslim kuyruğu", () => processDeliveryJobs(null, 4))) ?? [];
    for (const ev of events) {
      await step(`kilit ${ev.slug}`, async () => {
        if (await ensureLocked(ev.id, "otomatik")) {
          await enqueueSeals(ev.id);
          // Görünüm snapshot'u kilit tetikleyicisinde alınır; eksikse tek sefer tamamlanır (hash/SHA'ya dokunmaz).
          const { error } = await db.rpc("ensure_event_brand_snapshot", { p_event: ev.id });
          if (error) throw new Error(`görünüm snapshot'u: ${error.message}`);
        }
      });
    }
    processed = [...processed, ...((await step("mühür kuyruğu", () => drainDeliveryJobs(SEAL_DRAIN_MS))) ?? [])];
    details.jobs = { processed: processed.length, failed: processed.filter((r) => !r.ok).length };

    // Kilitsiz ve süresi dolmamış her etkinlik; son teslimi en yakın olan bütçeden önce pay alır.
    // Her adım kendi hatasını yakalar: bir etkinliğin hatası diğerlerini durdurmaz.
    const open = events
      .filter((ev) => !ev.locked_at && Date.now() < new Date(ev.deadline).getTime())
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
    if (open.length && withinBudget() && (await step("kira", () => tryLease("yardimci", 50)))) {
      const byEvent: Record<string, { health?: unknown; snapshots?: unknown }> = {};
      details.open = byEvent;
      for (const ev of open) {
        if (!withinBudget()) break;
        const out: { health?: unknown; snapshots?: unknown } = (byEvent[ev.slug] = {});
        out.health = await step(`sağlık ${ev.slug}`, () => checkHealthDue(ev));
        if (withinBudget()) out.snapshots = await step(`ara mühür ${ev.slug}`, () => takeSnapshots(ev));
        if (withinBudget()) await step(`hatırlatma ${ev.slug}`, () => sendReminders(ev));
      }
    }
    if (withinBudget() && (await step("kira", () => tryLease("depo-temizligi", 6 * 3600)))) {
      details.sweep = await step("depo temizliği", () => sweepStorage());
      details.requestKeys = await step("istek kilitleri", () => pruneRequestKeys());
    }
    details.ms = Date.now() - started;
    if (errors.length) details.errors = errors;
    const { error: finishError } = await db.from("worker_runs").update({
      finished_at: new Date().toISOString(), processed: processed.length, details,
      error: errors.length ? errors.join(" · ").slice(0, 500) : null,
    }).eq("id", run.id);
    if (finishError) throw new Error(finishError.message);
    return { processed, details, errors };
  } catch (e) {
    await db.from("worker_runs").update({ finished_at: new Date().toISOString(), details, error: message(e) }).eq("id", run.id);
    throw e;
  }
}

export { getEventRow };
