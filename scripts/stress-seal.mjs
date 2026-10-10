// Son saniye stres testi: çok sayıda ekip son dakikalarda teslim sürümünü günceller, süre dolar, mühür vurulur.
// Gerçek PostgreSQL + gerçek migration'lar + uygulamanın kendi arşiv doğrulama kodu (lib/delivery-core.ts).
// GitHub ve Supabase Storage, gecikme ve hata enjekte edilen sahte servislerdir. Canlı veritabanına bağlanmaz.
//
//   npm run test:stress -- --teams 150 --storm 120
//
// Seçenekler: --teams N  --storm SANİYE  --pool BAĞLANTI  --cron SANİYE  --seal-tick MS  --net MS  --faults ÇARPAN  --seed N
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, openSync, closeSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile, rm, link, unlink } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createCipheriv, createHash, randomUUID } from "node:crypto";
import { deflateRaw, crc32 } from "node:zlib";
import { promisify } from "node:util";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import pg from "pg";
import { captureSubmission, verifySealedArchive, hashArchive, validateArchive, isPermanentDeliveryError, retryTransient } from "../lib/delivery-core.ts";

const opt = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const CFG = {
  teams: opt("teams", 150),
  stormS: opt("storm", 120),
  pool: opt("pool", 20),
  cronS: opt("cron", 60),
  sealTickMs: opt("seal-tick", 1000),
  netMs: opt("net", 10),
  faults: opt("faults", 1),
  seed: opt("seed", 7),
};

// ------------------------------------------------------------------ yardımcılar
let seed = CFG.seed >>> 0;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const between = (a, b) => a + rnd() * (b - a);
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
const now = () => Date.now();
const pct = (values, p) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const summary = values => values.length
  ? { n: values.length, p50: +pct(values, 50).toFixed(1), p95: +pct(values, 95).toFixed(1), p99: +pct(values, 99).toFixed(1), max: +Math.max(...values).toFixed(1) }
  : { n: 0 };
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 23)}]`, ...a);
const deflateRawP = promisify(deflateRaw);

// ------------------------------------------------------------------ PostgreSQL (scripts/test-db.mjs ile aynı kurulum)
const roots = process.platform === "win32" ? "C:/Program Files/PostgreSQL" : null;
const bin = process.env.POSTGRES_BIN ?? (roots && existsSync(roots) ? join(roots, readdirSync(roots).sort().reverse()[0], "bin") : "");
const exe = name => bin ? join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
const artifacts = resolve("test-artifacts/stress");
const dataDir = join(artifacts, "pgdata");
const port = "54331";
const runPg = (name, args) => execFileSync(exe(name), args, { encoding: "utf8", windowsHide: true, timeout: 60_000 });
/** psql gerektirmez: tek seferlik bağlantıyla SQL (çok ifadeli, $$ gövdeli migration'lar dahil) çalıştırır. */
async function psql(sql, database = "postgres") {
  const client = new pg.Client({ host: "127.0.0.1", port: Number(port), user: "postgres", database, connectionTimeoutMillis: 3000 });
  await client.connect();
  try { return await client.query(sql); } finally { await client.end(); }
}

const storeDir = join(artifacts, `storage-${Date.now()}`);

// ------------------------------------------------------------------ ölçümler
const rpcStats = new Map();
const errorsSeen = new Map();
const jobLog = [];
const clickLog = [];
let collisions = 0;
let poolPeak = { waiting: 0, total: 0 };
const loopDelay = monitorEventLoopDelay({ resolution: 20 });

function note(fn, ms, error) {
  const s = rpcStats.get(fn) ?? { lat: [], errors: 0 };
  s.lat.push(ms);
  if (error) {
    s.errors++;
    const key = `${fn}: ${error.replace(/[0-9a-f-]{36}/g, "<id>").slice(0, 140)}`;
    errorsSeen.set(key, (errorsSeen.get(key) ?? 0) + 1);
  }
  rpcStats.set(fn, s);
}

let pool;
/** supabase-js `.rpc()` karşılığı: her çağrı ayrı transaction, araya ağ gecikmesi. */
async function db(fn, sql, params = []) {
  await sleep(CFG.netMs * between(0.6, 1.4));
  const t0 = performance.now();
  try {
    const { rows } = await pool.query(sql, params);
    note(fn, performance.now() - t0);
    return rows;
  } catch (e) {
    note(fn, performance.now() - t0, e.message);
    throw e;
  } finally {
    await sleep(CFG.netMs * between(0.6, 1.4));
  }
}
const scalar = async (fn, sql, params) => Object.values((await db(fn, sql, params))[0] ?? {})[0];

// ------------------------------------------------------------------ sahte GitHub
const MB = 1024 * 1024;
const LIMIT = 50 * MB;
const shaInfo = new Map(); // sha -> { team, seq, size, hash }
const shaOf = (team, seq) => createHash("sha1").update(`${CFG.seed}:${team}:${seq}`).digest("hex");

/** GitHub zipball benzeri: üst klasör, deflate girdiler, sha'dan türetilen belirlenimci içerik. */
async function buildZip(sha, size) {
  const root = `ekip-${sha.slice(0, 7)}/`;
  const code = Buffer.from(`// ${sha}\n` + "export const muhur = () => 'vuruldu';\n".repeat(300));
  const blob = createCipheriv("aes-128-ctr", Buffer.from(sha.slice(0, 32), "hex"), Buffer.alloc(16))
    .update(Buffer.alloc(Math.max(1024, size - 16_000)));
  const files = [[`${root}README.md`, Buffer.from(`# ${sha}\n`)], [`${root}src/index.js`, code], [`${root}assets/model.bin`, blob]];
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const packed = await deflateRawP(data, { level: 1 });
    const nameBytes = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28); entry.writeUInt32LE(offset, 42);
    parts.push(local, nameBytes, packed);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, directory, end]));
}

const github = {
  heads: new Map(), // team -> en son push edilen sha
  push(team, seq, size) {
    const sha = shaOf(team, seq);
    shaInfo.set(sha, { team, seq, size, hash: null });
    this.heads.set(team, sha);
    return sha;
  },
  async head(team) {
    await sleep(between(150, 700));
    if (rnd() < 0.01 * CFG.faults) throw new Error("GitHub 503");
    return this.heads.get(team) ?? null;
  },
  async download(_name, sha) {
    const info = shaInfo.get(sha);
    await sleep(between(200, 700));
    if (info.size > LIMIT) throw new Error("Arşiv 50 MB sınırını aşıyor.");
    const roll = rnd();
    if (roll < 0.005 * CFG.faults) { await sleep(45_000); throw new Error("The operation was aborted due to timeout"); }
    if (roll < 0.035 * CFG.faults) throw new Error("Arşiv indirilemedi (502)");
    const zip = await buildZip(sha, info.size);
    await sleep((zip.byteLength / (25 * MB)) * 1000); // ~25 MB/s indirme
    const hash = hashArchive(zip);
    if (info.hash && info.hash !== hash) throw new Error("TEST HATASI: zipball belirlenimci değil");
    info.hash = hash;
    return zip;
  },
};

// ------------------------------------------------------------------ sahte Storage (upsert:false, atomik yazma)
const storage = {
  file: path => join(storeDir, path),
  async read(path) {
    await sleep(30);
    if (rnd() < 0.005 * CFG.faults) throw new Error("Arşiv deposuna ulaşılamadı.");
    try {
      const bytes = new Uint8Array(await readFile(storage.file(path)));
      await sleep((bytes.byteLength / (80 * MB)) * 1000);
      return bytes;
    } catch (e) { if (e.code === "ENOENT") return null; throw e; }
  },
  async upload(path, bytes) {
    await sleep(50 + (bytes.byteLength / (40 * MB)) * 1000);
    if (rnd() < 0.01 * CFG.faults) throw new Error("Storage 503");
    const target = storage.file(path);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${randomUUID()}.tmp`;
    await writeFile(tmp, bytes);
    try { await link(tmp, target); }
    catch (e) { if (e.code === "EEXIST") { collisions++; throw new Error("The resource already exists"); } throw e; }
    finally { await unlink(tmp).catch(() => {}); }
    // Yazma başarılı ama yanıt kayboldu: yeniden deneme, depodaki kopyayı kullanmalı.
    if (rnd() < 0.005 * CFG.faults) throw new Error("Storage yanıtı kayboldu");
  },
  async remove(paths) { await Promise.all(paths.map(p => rm(storage.file(p), { force: true }))); },
};

// ------------------------------------------------------------------ lib/delivery.ts ile birebir iş işleyici
async function assertJobWritable(job) {
  const state = await scalar("delivery_job_state", "select delivery_job_state($1::uuid,$2::uuid)", [job.id, job.lease_token]);
  if (state === "locked") throw new Error("LOCKED: Teslim süresi doldu; arşiv yazılmadı.");
  if (state !== "ok") throw new Error("Teslim işi artık geçerli değil.");
}

async function pruneAcceptedArchives(projectId) {
  const rows = await db("prune_submission_archives", "select * from prune_submission_archives($1::uuid, 3) as path", [projectId]);
  const paths = rows.map(r => r.path);
  if (paths.length) await storage.remove(paths);
}

async function processDeliveryJobs(projectId = null, limit = 4, source = "after") {
  const jobs = await db("claim_delivery_jobs", "select * from claim_delivery_jobs($1::uuid,$2::int)", [projectId, limit]);
  return Promise.all(jobs.map(async job => {
    const entry = { id: job.id, project: job.project_id, kind: job.kind, sha: job.sha, attempt: job.attempts, source, start: now() };
    jobLog.push(entry);
    try {
      let completed;
      if (job.kind === "submit") {
        completed = await retryTransient(() => captureSubmission(job, {
          read: storage.read,
          download: github.download,
          write: async (path, bytes) => { await assertJobWritable(job); await storage.upload(path, bytes); },
          complete: async (path, hash, bytes) => (await scalar("complete_submission",
            "select complete_submission($1::uuid,$2::uuid,$3,$4,$5::bigint)", [job.id, job.lease_token, path, hash, bytes])) === true,
        }));
      } else {
        const [p] = await db("projects.select", "select accepted_archive_path, accepted_archive_sha256, accepted_archive_bytes, archive_sha256 from projects where id=$1", [job.project_id]);
        if (!p) throw new Error("Proje okunamadı.");
        if (!p.archive_sha256) {
          if (!p.accepted_archive_path) throw new Error("Süre dolmadan kabul edilmiş teslim sürümü yok. Sonradan kod kabul edilemez.");
          await retryTransient(() => verifySealedArchive(p.accepted_archive_path, p.accepted_archive_sha256, Number(p.accepted_archive_bytes), storage.read));
        }
        completed = (await scalar("complete_seal", "select complete_seal($1::uuid,$2::uuid)", [job.id, job.lease_token])) === true;
      }
      if (completed && job.kind === "submit") await pruneAcceptedArchives(job.project_id).catch(() => {});
      Object.assign(entry, { end: now(), outcome: completed ? "ok" : "rejected" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Arşiv işlemi tamamlanamadı.";
      const permanent = isPermanentDeliveryError(message);
      Object.assign(entry, { end: now(), outcome: permanent ? "failed" : "retry", message });
      await db("fail_delivery_job", "select fail_delivery_job($1::uuid,$2::uuid,$3,$4::boolean)", [job.id, job.lease_token, message, !permanent]);
      entry.retry = !permanent;
    }
    return entry;
  }));
}

/** lib/delivery.ts processProjectJobs: geçici hatayla sıraya dönen iş 11 sn sonra yeniden denenir. */
async function processProjectJobs(projectId) {
  for (let round = 0; round < 4; round++) {
    const outcomes = await processDeliveryJobs(projectId, 4, round ? "after+takip" : "after");
    if (!outcomes.some(o => o.retry)) return;
    await sleep(11_000);
  }
}

// ------------------------------------------------------------------ app/actions.ts submitVersion karşılığı
let eventId;
let deadlineMs;
const inflight = new Set();
const track = promise => { inflight.add(promise); promise.finally(() => inflight.delete(promise)); return promise; };

async function click(team, member, reason) {
  const record = { team: team.no, member, reason, t: now(), status: null, sha: null };
  clickLog.push(record);
  if (now() >= deadlineMs) { record.status = "locked_client"; return record; }
  let sha;
  try { sha = await github.head(team.no); }
  catch { record.status = "github_error"; return record; }
  record.sha = sha;
  try {
    const result = await scalar("enqueue_submission", "select enqueue_submission($1::uuid,$2::uuid,$3,$4,$5)",
      [team.projectId, team.members[member], sha, "main", `stres/ekip-${team.no}`]);
    record.status = result.status;
    record.jobId = result.jobId ?? null;
    if (result.status === "queued") track(processProjectJobs(team.projectId).catch(e => note("after()", 0, e.message)));
  } catch (e) {
    record.status = /LOCKED/.test(e.message) ? "locked_server" : "db_error";
    record.error = e.message;
  }
  record.ms = now() - record.t;
  return record;
}

/** Ekip davranışı: "işleniyor" ya da GitHub hatası görürse birkaç saniye sonra yeniden basar. */
async function userSubmits(team, member, reason) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await click(team, member, attempt ? `${reason}+tekrar` : reason);
    if (r.status === "busy") { await sleep(between(3000, 8000)); continue; }
    if (r.status === "github_error" || r.status === "db_error") { await sleep(between(2000, 4000)); continue; }
    return;
  }
}

// ------------------------------------------------------------------ cron (lib/freeze.ts tick'in kritik bölümü)
async function tick(source) {
  try {
    await processDeliveryJobs(null, 4, source);
    const locked = await scalar("lock_delivery_event", "select lock_delivery_event($1::uuid,'otomatik',false)", [eventId]);
    if (locked) await db("enqueue_seals", "select enqueue_seals($1::uuid)", [eventId]);
    // lib/delivery.ts drainDeliveryJobs: kuyruk boşalana ya da 40 sn dolana kadar.
    const started = now();
    while (now() - started < 40_000 && (await processDeliveryJobs(null, 8, source)).length) { /* boşalt */ }
  } catch (e) { note("tick", 0, e.message); }
}

// ------------------------------------------------------------------ senaryo
function sizeFor(team) {
  if (team.kind === "fat") return 55 * MB;
  const r = rnd();
  if (r < 0.6) return Math.round(between(0.1, 1) * MB);
  if (r < 0.9) return Math.round(between(1, 5) * MB);
  if (r < 0.98) return Math.round(between(5, 20) * MB);
  return Math.round(between(20, 48) * MB);
}

function planTeams() {
  const teams = [];
  for (let no = 1; no <= CFG.teams; no++) {
    const r = rnd();
    const kind = no === 1 ? "fat" : r < 0.05 ? "never" : r < 0.08 ? "spam" : r < 0.18 ? "idle" : "normal";
    teams.push({ no, kind, members: [], baseSize: 0 });
  }
  return teams;
}

async function main() {
  mkdirSync(artifacts, { recursive: true });
  if (!existsSync(join(dataDir, "PG_VERSION"))) {
    mkdirSync(dataDir, { recursive: true });
    runPg("initdb", ["-D", dataDir, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  }
  const logFd = openSync(join(artifacts, "postgres.log"), "w");
  const server = spawn(exe("postgres"), ["-D", dataDir, "-h", "127.0.0.1", "-p", port,
    "-c", `max_connections=${CFG.pool + 40}`, "-c", "log_lock_waits=on", "-c", "deadlock_timeout=200ms"],
  { windowsHide: true, stdio: ["ignore", logFd, logFd] });
  server.on("error", () => {});
  let database;
  try {
    let started = false;
    for (let i = 0; i < 20 && !started; i++) {
      await sleep(500);
      try { await psql("select 1;"); started = true; } catch { if (server.exitCode !== null) break; }
    }
    if (!started) throw new Error("Yerel PostgreSQL başlatılamadı (test-artifacts/stress/postgres.log).");
    database = `muhur_stress_${Date.now()}`;
    await psql(`CREATE DATABASE ${database};`);
    await psql(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
    END $$;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`, database);
    for (const file of ["0001_init.sql", "0002_events.sql", "0004_delivery.sql", "0005_hardening.sql", "0006_son_dakika.sql"]) {
      await psql(await readFile(resolve("supabase/migrations", file), "utf8"), database);
    }
    pool = new pg.Pool({ host: "127.0.0.1", port: Number(port), user: "postgres", database, max: CFG.pool });
    const sampler = setInterval(() => {
      poolPeak = { waiting: Math.max(poolPeak.waiting, pool.waitingCount), total: Math.max(poolPeak.total, pool.totalCount) };
    }, 50);
    log("Ayar:", JSON.stringify(CFG));

    // ---- 1. Hazırlık: eşzamanlı kayıt, ekip katılımı, ilk teslimler
    eventId = randomUUID();
    await pool.query(`update events set is_current=false where is_current;
      insert into events(id,slug,title,starts_at,deadline,is_current)
      values('${eventId}','stres','Stres Testi',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',true)`);
    const teams = planTeams();
    const userCount = teams.length * 3;
    const users = Array.from({ length: userCount }, () => randomUUID());
    await pool.query(`insert into auth.users(id) select unnest($1::uuid[])`, [users]);
    const t0 = performance.now();
    await Promise.all(teams.map(async (team, i) => {
      team.members = users.slice(i * 3, i * 3 + 1 + Math.floor(rnd() * 3));
      team.baseSize = sizeFor(team);
      const sha = team.kind === "never" ? null : github.push(team.no, 0, team.kind === "fat" ? Math.round(3 * MB) : team.baseSize);
      const [row] = await db("register_project", `select id, invite_code from register_project($1::uuid,$2::uuid,$3,null,$4,$5,$6,$7::bigint,$8,$9,'main',null,$10)`,
        [eventId, team.members[0], `kurucu${team.no}`, `Proje ${team.no}`, `Ekip ${team.no}`, "Stres testi projesi.", 1000 + team.no,
          `stres/ekip-${team.no}`, `https://github.com/stres/ekip-${team.no}`, sha]);
      team.projectId = row.id;
      for (const member of team.members.slice(1)) {
        await db("join_project_by_code", "select join_project_by_code($1,$2::uuid,$3,null)", [row.invite_code, member, `uye-${member.slice(0, 6)}`]);
      }
    }));
    const registerMs = performance.now() - t0;
    log(`${teams.length} ekip eşzamanlı kaydoldu (${registerMs.toFixed(0)} ms). İlk teslimler işleniyor...`);
    const warmFaults = CFG.faults;
    CFG.faults = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while ((await processDeliveryJobs(null, 8, "hazirlik")).length) { /* kuyruk boşalana kadar */ }
    }));
    CFG.faults = warmFaults;
    const [{ n: warmAccepted }] = (await pool.query("select count(*)::int n from projects where accepted_sha is not null")).rows;
    log(`Hazırlık bitti: ${warmAccepted}/${teams.length} ekibin kabul edilmiş ilk sürümü var.`);
    jobLog.length = 0;
    for (const s of rpcStats.values()) { s.lat.length = 0; s.errors = 0; }
    errorsSeen.clear();

    // ---- 2. Fırtına: son STORM saniye
    const stormStart = now();
    deadlineMs = stormStart + CFG.stormS * 1000;
    await pool.query("update events set deadline=to_timestamp($1::double precision/1000) where id=$2", [deadlineMs, eventId]);
    log(`Fırtına başladı. Son teslim ${CFG.stormS} sn sonra: ${new Date(deadlineMs).toISOString()}`);
    loopDelay.enable();

    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(() => track(Promise.resolve().then(fn)), Math.max(0, ms - now())));
    const plan = [];
    for (const team of teams) {
      if (team.kind === "never" || team.kind === "idle") continue;
      if (team.kind === "spam") {
        for (let k = 1; k <= 10; k++) plan.push({ team, seq: k, t: stormStart + (CFG.stormS * 0.2 + k * 4) * 1000, delay: [200, 800], clickers: 1 });
        continue;
      }
      const pushes = team.kind === "fat" ? 1 : 1 + Math.floor(rnd() * 4);
      // Yoğunluk son saniyelere doğru artar: itişlerin ~%16'sı son 3 sn'de, ~%29'u son 10 sn'de.
      const times = Array.from({ length: pushes }, () => deadlineMs - CFG.stormS * 1000 * rnd() ** 2).sort((a, b) => a - b);
      times.forEach((t, k) => plan.push({ team, seq: k + 1, t, delay: [1000, 6000], clickers: rnd() < 0.6 ? 1 : rnd() < 0.75 ? 2 : 3 }));
    }
    for (const p of plan) {
      at(p.t, () => {
        github.push(p.team.no, p.seq, p.team.kind === "fat" ? p.team.baseSize : Math.round(p.team.baseSize * between(0.95, 1.1)));
        const clickAt = p.t + between(...p.delay);
        for (let c = 0; c < p.clickers; c++) {
          const member = Math.min(c, p.team.members.length - 1);
          at(clickAt + between(0, 400), () => userSubmits(p.team, member, `push#${p.seq}`));
        }
      });
    }
    // Teslimden sonra veri bozulması: iki arşiv bit hatası, bir arşiv kayıp. Mühür bunları yakalamalı.
    const sabotaged = { corrupted: [], missing: [] };
    at(deadlineMs - 5000, async () => {
      const victims = teams.filter(t => t.kind === "idle").slice(0, 3);
      for (const [i, team] of victims.entries()) {
        const { rows: [p] } = await pool.query("select accepted_archive_path from projects where id=$1", [team.projectId]);
        if (!p?.accepted_archive_path) continue;
        const file = storage.file(p.accepted_archive_path);
        if (i < 2) {
          const bytes = await readFile(file);
          bytes[Math.floor(bytes.length / 2)] ^= 0x01;
          await writeFile(file, bytes);
          sabotaged.corrupted.push(team.no);
        } else {
          await rm(file);
          sabotaged.missing.push(team.no);
        }
      }
    });
    // Süre dolduktan sonra basanlar.
    for (const team of teams.filter(t => t.kind === "normal").slice(0, 5)) {
      at(deadlineMs + between(100, 4000), () => userSubmits(team, 0, "gec"));
    }
    const cronOffset = between(5, CFG.cronS) * 1000;
    let cronTicks = 0;
    const cronTimer = setTimeout(function loop() {
      cronTicks++;
      track(tick("cron"));
      cronTimerRef = setTimeout(loop, CFG.cronS * 1000);
    }, cronOffset);
    let cronTimerRef = cronTimer;

    await sleep(deadlineMs - now() + 8000);
    log(`Süre doldu. Uçuştaki istekler bekleniyor (${inflight.size})...`);
    while (inflight.size) await Promise.allSettled([...inflight]);
    clearTimeout(cronTimerRef);
    const stormEnd = now();
    log(`Fırtına bitti: ${clickLog.length} tıklama, ${jobLog.length} iş denemesi.`);

    // ---- 3. Mühür: cron ritmi korunur, aralık sıkıştırılır (her tick = üretimde 1 dakika)
    let sealTicks = 0;
    let firstPassTick = 0;
    const sealStart = now();
    while (true) {
      sealTicks++;
      await tick("muhur");
      // Kayıp arşivin yeniden denemeleri (~15 dk geri çekilme) ayrıca raporlanır; mühür ölçümünü bekletmez.
      const parked = teams.filter(t => sabotaged.missing.includes(t.no)).map(t => t.projectId);
      const { rows: [{ open }] } = await pool.query(
        "select count(*)::int as open from delivery_jobs where state in ('queued','processing') and kind='seal' and not (project_id = any($1::uuid[]))", [parked]);
      const { rows: [{ missing }] } = await pool.query(
        "select count(*)::int as missing from projects p where event_id=$1 and not exists(select 1 from delivery_jobs j where j.project_id=p.id and j.kind='seal')", [eventId]);
      const { rows: [{ untouched }] } = await pool.query(
        "select count(*)::int as untouched from delivery_jobs where kind='seal' and event_id=$1 and attempts=0", [eventId]);
      if (!firstPassTick && !missing && !untouched) firstPassTick = sealTicks;
      if (!open && !missing) break;
      if (sealTicks > 2000) throw new Error("Mühür kuyruğu boşalmadı.");
      await sleep(CFG.sealTickMs);
    }
    const sealMs = now() - sealStart;
    clearInterval(sampler);
    loopDelay.disable();
    log(`Mühür kuyruğu ${sealTicks} tick'te boşaldı.`);

    // ---- 4. Bağımsız doğrulama (hata enjeksiyonu kapalı)
    CFG.faults = 0;
    const { rows: projects } = await pool.query(`select p.*, (select count(*) from submissions s where s.project_id=p.id)::int as subs
      from projects p where event_id=$1 order by exhibit_no`, [eventId]);
    const { rows: subs } = await pool.query("select s.* from submissions s join projects p on p.id=s.project_id where p.event_id=$1", [eventId]);
    const { rows: jobs } = await pool.query("select * from delivery_jobs where event_id=$1", [eventId]);
    const { rows: [ev] } = await pool.query("select deadline, locked_at from events where id=$1", [eventId]);
    const deadline = ev.deadline.getTime();
    const violations = [];
    const fail = (rule, detail) => violations.push({ rule, detail });

    for (const s of subs) if (s.accepted_at.getTime() >= deadline) fail("süre sonrası kabul", { sub: s.id, at: s.accepted_at });
    for (const j of jobs) {
      const parkedJob = j.kind === "seal" && teams.some(t => t.projectId === j.project_id && sabotaged.missing.includes(t.no));
      if (["queued", "processing"].includes(j.state) && !parkedJob) fail("açık iş kaldı", { job: j.id, kind: j.kind, state: j.state });
      if (j.attempts > 5) fail("5'ten fazla deneme", { job: j.id });
    }
    const jobsByStart = new Map();
    for (const e of jobLog) {
      const k = `${e.id}:${e.attempt}`;
      if (jobsByStart.has(k)) fail("aynı iş denemesi iki kez işlendi", { job: e.id, attempt: e.attempt });
      jobsByStart.set(k, e);
    }
    if (collisions) fail("depoda yol çakışması", { collisions });

    const byTeam = new Map(teams.map(t => [t.projectId, t]));
    let sealed = 0;
    for (const p of projects) {
      const team = byTeam.get(p.id);
      team.project = p;
      if (!p.archive_sha256) continue;
      sealed++;
      const bytes = await storage.read(p.archive_path).catch(() => null) ?? await storage.read(p.archive_path);
      if (!bytes || hashArchive(bytes) !== p.archive_sha256 || bytes.byteLength !== Number(p.archive_bytes)) fail("mühürlü dosya hash'i tutmuyor", { team: team.no });
      else validateArchive(bytes);
      if (p.frozen_sha !== p.accepted_sha) fail("mühür sha ≠ kabul sha", { team: team.no });
      if (shaInfo.get(p.frozen_sha)?.hash !== p.archive_sha256) fail("mühür, commit'in gerçek içeriği değil", { team: team.no });
      const latest = subs.filter(s => s.project_id === p.id).sort((a, b) => b.accepted_at - a.accepted_at)[0];
      if (!latest || latest.sha !== p.frozen_sha || latest.archive_sha256 !== p.archive_sha256) fail("mühür son kabul değil", { team: team.no });
      if (p.frozen_at.getTime() !== Math.min(deadline, ev.locked_at?.getTime() ?? deadline)) fail("mühür zamanı son teslim değil", { team: team.no });
      const lookups = projects.filter(q => q.archive_sha256 === p.archive_sha256);
      if (lookups.length !== 1) fail("/dogrula hash araması tekil değil", { team: team.no });
    }
    for (const no of [...sabotaged.corrupted, ...sabotaged.missing]) {
      const t = teams.find(x => x.no === no);
      if (t.project.archive_sha256) fail("bozuk/kayıp arşiv mühürlendi", { team: no });
    }
    for (const t of teams.filter(x => x.kind === "never")) if (t.project.archive_sha256) fail("teslimsiz ekip mühürlendi", { team: t.no });

    // ---- 5. Hakkaniyet: ekibin son niyet ettiği sürüm mü mühürlendi?
    const seqOf = sha => shaInfo.get(sha)?.seq ?? null;
    /** "busy" yanıtını veren işin o anda ne yaptığı: normal işleniyor mu, geçici hatadan sonra geri çekilmede mi? */
    const busyReason = busyClicks => {
      const backoff = busyClicks.some(c => jobLog.some(e => e.id === c.jobId && e.outcome === "retry" && e.end <= c.t));
      const slow = busyClicks.some(c => jobLog.some(e => e.id === c.jobId && e.start <= c.t && (e.end ?? Infinity) - e.start > 10_000));
      return backoff ? "busy: önceki iş geçici hatadan sonra geri çekilmede bekliyordu"
        : slow ? "busy: önceki iş uzun süren indirmede (45 sn zaman aşımı)"
        : "busy: önceki sürüm normal işlenirken süre doldu";
    };
    const reasons = new Map();
    const marginBuckets = [[30, Infinity], [10, 30], [5, 10], [2, 5], [0, 2]].map(([lo, hi]) => ({ label: `${lo}-${hi === Infinity ? "∞" : hi} sn`, lo, hi, total: 0, ok: 0 }));
    const clickToAccept = [];
    const outcome = [];
    let lateTeams = 0;
    for (const team of teams) {
      const clicks = clickLog.filter(c => c.team === team.no && c.t < deadline && c.sha);
      const intended = clicks.reduce((best, c) => (seqOf(c.sha) > (best === null ? -1 : seqOf(best)) ? c.sha : best), null);
      const sealedSeq = team.project.archive_sha256 ? seqOf(team.project.frozen_sha) : null;
      let reason;
      if (team.kind === "never") reason = "beklenen: hiç teslim yok";
      else if (sabotaged.corrupted.includes(team.no)) reason = "beklenen: bozuk arşiv yakalandı";
      else if (sabotaged.missing.includes(team.no)) reason = "beklenen: kayıp arşiv yakalandı";
      else if (!intended) reason = sealedSeq !== null ? "tamam (fırtınada teslim yok)" : "mühür yok";
      else if (sealedSeq === seqOf(intended)) reason = "tamam";
      else {
        const forSha = jobs.filter(j => j.project_id === team.projectId && j.sha === intended);
        const statuses = new Set(clicks.filter(c => c.sha === intended).map(c => c.status));
        const attempts = jobLog.filter(e => e.project === team.projectId && e.sha === intended);
        if (team.kind === "fat") reason = "beklenen: 50 MB sınırı";
        else if (!forSha.length) reason = statuses.has("rate_limited") ? "kota (10 dk'da 6)" : statuses.has("busy") ? busyReason(clicks.filter(c => c.sha === intended && c.status === "busy")) : `kuyruğa girmedi (${[...statuses].join(",")})`;
        else {
          const j = forSha.sort((a, b) => b.created_at - a.created_at)[0];
          if (attempts.some(a => a.outcome === "retry")) reason = `geçici hata, yeniden deneme yetişmedi (${attempts.find(a => a.outcome === "retry").message})`;
          else if (/işlenmeden kapatıldı/.test(j.error ?? "")) reason = "kuyrukta bekledi, işlenmeden süre doldu";
          else if (/doğrulanamadı|arşiv yazılmadı/.test(j.error ?? "")) reason = "işleniyordu, kabulden önce süre doldu";
          else reason = `diğer: ${j.state} ${j.error ?? ""}`;
        }
      }
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      const lastPushed = Math.max(-1, ...[...shaInfo.values()].filter(i => i.team === team.no).map(i => i.seq));
      const lateOnly = lastPushed > (intended ? seqOf(intended) : 0) && clickLog.some(c => c.team === team.no && c.t >= deadline);
      if (lateOnly) lateTeams++;
      outcome.push({ clicks: clickLog.filter(c => c.team === team.no).map(c => `${((c.t - deadline) / 1000).toFixed(1)}s ${c.status} ${c.sha ? seqOf(c.sha) : "-"}`),
        jobs: jobLog.filter(e => e.project === team.projectId).map(e => `${((e.start - deadline) / 1000).toFixed(1)}s ${e.kind}#${e.sha ? seqOf(e.sha) : "-"} a${e.attempt} ${e.source} ${e.outcome}${e.message ? ` (${e.message})` : ""}`),
        team: team.no, kind: team.kind, intendedSeq: intended ? seqOf(intended) : null, sealedSeq, lastPushed, lateOnly, reason });
      if (intended && !reason.startsWith("beklenen")) {
        const first = clicks.find(c => c.sha === intended);
        const margin = (deadline - first.t) / 1000;
        const bucket = marginBuckets.find(b => margin >= b.lo && margin < b.hi);
        bucket.total++;
        if (reason === "tamam") bucket.ok++;
        const sub = subs.find(s => s.sha === intended);
        if (sub) clickToAccept.push(sub.accepted_at.getTime() - first.t);
      }
    }

    // ---- 6. Rapor
    const clicksByStatus = {};
    for (const c of clickLog) clicksByStatus[c.status] = (clicksByStatus[c.status] ?? 0) + 1;
    const jobDur = kind => summary(jobLog.filter(e => e.kind === kind && e.end).map(e => e.end - e.start));
    const pgLog = await readFile(join(artifacts, "postgres.log"), "utf8").catch(() => "");
    const report = {
      config: CFG,
      when: new Date().toISOString(),
      teams: Object.fromEntries(["normal", "idle", "spam", "never", "fat"].map(k => [k, teams.filter(t => t.kind === k).length])),
      registration: { concurrent: teams.length, ms: Math.round(registerMs) },
      storm: { seconds: (stormEnd - stormStart) / 1000, pushes: plan.length, clicks: clickLog.length, clicksByStatus, jobAttempts: jobLog.length, cronTicks },
      latencyMs: {
        clickToAccepted: summary(clickToAccept),
        submitJob: jobDur("submit"),
        sealJob: jobDur("seal"),
        rpc: Object.fromEntries([...rpcStats].map(([fn, s]) => [fn, { ...summary(s.lat), errors: s.errors }])),
        eventLoopP99: +(loopDelay.percentile(99) / 1e6).toFixed(1),
      },
      pool: { size: CFG.pool, peakWaiting: poolPeak.waiting },
      seal: { ticksUntilEveryProjectAttempted: firstPassTick, ticksUntilQueueEmpty: sealTicks, wallMs: sealMs, retries: jobLog.filter(e => e.kind === "seal" && e.outcome === "retry").length, sealed, total: projects.length },
      fairness: { teamsWhoseLastPushWasClickedAfterDeadline: lateTeams, reasons: Object.fromEntries([...reasons].sort((a, b) => b[1] - a[1])), byMargin: marginBuckets.map(({ label, total, ok }) => ({ label, total, ok, rate: total ? +(ok / total * 100).toFixed(1) : null })) },
      sabotaged: { ...sabotaged, missingSealJobs: jobs.filter(j => j.kind === "seal" && teams.some(t => t.projectId === j.project_id && sabotaged.missing.includes(t.no)))
        .map(j => ({ state: j.state, attempts: j.attempts, error: j.error, nextAttemptInS: Math.round((j.next_attempt_at - now()) / 1000) })) },
      errors: Object.fromEntries([...errorsSeen].sort((a, b) => b[1] - a[1])),
      postgres: { deadlocks: (pgLog.match(/deadlock detected/g) ?? []).length, lockWaits: (pgLog.match(/still waiting for/g) ?? []).length },
      violations,
      outcome,
    };
    const file = join(artifacts, `stres-${CFG.teams}ekip-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, outcome: undefined }, null, 2));
    log(`Rapor: ${file}`);
    if (violations.length) { console.error(`İHLAL: ${violations.length} değişmez bozuldu.`); process.exitCode = 1; }
    else log("Bütün değişmezler sağlandı.");
  } finally {
    await pool?.end().catch(() => {});
    if (database) { try { await psql(`DROP DATABASE ${database} WITH (FORCE);`); } catch { /* yalnızca bu çalışmanın veritabanı */ } }
    try { runPg("pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"]); } catch { server.kill(); }
    closeSync(logFd);
    await rm(storeDir, { recursive: true, force: true });
  }
}

main().catch(e => { console.error(e.stderr?.toString() || e.stack || e.message); process.exitCode = 1; });
