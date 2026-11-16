import { execFileSync, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { testCommunityRaces } from "../tests/community-races.mjs";
import { testPolicyRaces } from "../tests/policy-races.mjs";
import { existsSync, mkdirSync, readdirSync, openSync, closeSync } from "node:fs";
import { resolve, join } from "node:path";

const roots = process.platform === "win32" ? "C:/Program Files/PostgreSQL" : null;
const bin = process.env.POSTGRES_BIN ?? (roots && existsSync(roots) ? join(roots, readdirSync(roots).sort().reverse()[0], "bin") : "");
const exe = name => bin ? join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
const data = resolve(".test-db");
const log = resolve(".test-db/server.log");
const port = "54329";
const run = (name, args, options = {}) => execFileSync(exe(name), args, { encoding: "utf8", windowsHide: true, timeout: 30_000,
  env: { ...process.env, PGCONNECT_TIMEOUT: "3", PGCLIENTENCODING: "UTF8" }, ...options });
const psql = (sql, database = "postgres") => run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database], { input: sql });
let started = false;
let server;
let logFd;
let database;
try {
  if (!existsSync(join(data, "PG_VERSION"))) {
    mkdirSync(data, { recursive: true });
    run("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  }
  // postgres doğrudan başlatılır: Windows sandbox pg_ctl'nin restricted-token yardımcısını desteklemeyebilir.
  logFd = openSync(log, "a");
  server = spawn(exe("postgres"), ["-D", data, "-h", "127.0.0.1", "-p", port], { windowsHide: true, stdio: ["ignore", logFd, logFd] });
  server.on("error", () => {});
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try { psql("select 1;"); started = true; break; } catch { if (server.exitCode !== null) break; }
  }
  if (!started) throw new Error("Yerel test PostgreSQL başlatılamadı. .test-db/server.log dosyasını kontrol et.");
  database = `muhur_test_${Date.now()}`;
  psql(`CREATE DATABASE ${database};`);
  psql(`DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
  END $$;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  `, database);
  for (const file of ["0001_init.sql", "0002_events.sql", "0004_delivery.sql", "0005_hardening.sql", "0006_son_dakika.sql", "0007_gizem.sql", "0008_activity.sql", "0009_mascot_naming.sql", "0010_mascot_name_edit.sql", "0011_bayat_teslim_hatasi.sql", "0012_topluluklar.sql", "0013_etkinlik_olustur.sql", "0014_guncel_etkinlik_kaldir.sql", "0015_basvuru_ve_sozlesme_temeli.sql", "0016_davetler_ve_brevo_kuyrugu.sql", "0017_sozlesme_uygulama.sql"]) {
    run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-f", resolve("supabase/migrations", file)]);
  }
  console.log("Migration dosyaları gerçek PostgreSQL üzerinde uygulandı.");
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-f", resolve("tests/database.sql")]);
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-f", resolve("tests/database-hardening.sql")]);
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-f", resolve("tests/database-last-minute.sql")]);
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-f", resolve("tests/database-activity.sql")]);
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-f", resolve("tests/database-mystery.sql")]);
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-f", resolve("tests/database-mascot.sql")]);
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-f", resolve("tests/database-tenancy.sql")]);
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-f", resolve("tests/database-events.sql")]);
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-f", resolve("tests/database-community-applications.sql")]);
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-f", resolve("tests/database-policies.sql")]);
  console.log("Veritabanı kural testleri geçti.");
  const eventId = "20000000-0000-0000-0000-000000000001";
  const userId = "20000000-0000-0000-0000-000000000002";
  psql(`INSERT INTO events(id,slug,title,starts_at,deadline,community_id) VALUES('${eventId}','concurrent','Eşzamanlı Test',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',(SELECT id FROM communities WHERE slug='deu-csai'));
    INSERT INTO auth.users(id) VALUES('${userId}');`, database);
  const asyncPsql = sql => promisify(execFile)(exe("psql"), ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-c", sql],
    { windowsHide: true, encoding: "utf8", timeout: 10_000, env: { ...process.env, PGCLIENTENCODING: "UTF8", PGCONNECT_TIMEOUT: "3" } });
  const register = repo => `SELECT id FROM register_project('${eventId}','${userId}','owner',null,'Concurrent Proje','Test Ekip','Concurrent registration test.',${repo},'owner/repo${repo}','https://github.com/owner/repo${repo}','main',null,repeat('a',40));`;
  const registrations = await Promise.allSettled([asyncPsql(register(111)), asyncPsql(register(112))]);
  if (!registrations.some(r => r.status === "fulfilled")) {
    for (const result of registrations) if (result.status === "rejected") console.error(result.reason.stderr || result.reason.message);
  }
  assert.equal(registrations.filter(r => r.status === "fulfilled").length, 1, "Aynı kullanıcıya eşzamanlı iki proje oluşturuldu.");
  assert.equal(registrations.filter(r => r.status === "rejected").length, 1);
  console.log("PASS: Eşzamanlı iki kayıt isteğinde tek proje ve tek kurucu oluştu.");
  const claims = await Promise.all([
    asyncPsql("BEGIN; SELECT id FROM claim_delivery_jobs(null,1); SELECT pg_sleep(0.4); COMMIT;"),
    asyncPsql("BEGIN; SELECT id FROM claim_delivery_jobs(null,1); SELECT pg_sleep(0.4); COMMIT;"),
  ]);
  const ids = claims.flatMap(r => r.stdout.split(/\r?\n/).filter(line => /^[a-f0-9-]{36}$/.test(line)));
  assert.equal(ids.length, 1, "İki çalışan aynı işi aldı.");
  console.log("PASS: Aynı anda çalışan iki worker, tek işi paylaşmadı (SKIP LOCKED).");
  // Ekip yarışları: yetki okuması ile yazma arasında rol/davet değişirse eski istek yazamaz.
  const teamEvent = "20000000-0000-0000-0000-000000000010";
  const [owner, member, guest] = ["20000000-0000-0000-0000-000000000011", "20000000-0000-0000-0000-000000000012", "20000000-0000-0000-0000-000000000013"];
  const teamProject = psql(`INSERT INTO events(id,slug,title,starts_at,deadline,community_id) VALUES('${teamEvent}','team-race','Ekip Yarışı',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',(SELECT id FROM communities WHERE slug='deu-csai'));
    INSERT INTO auth.users(id) VALUES('${owner}'),('${member}'),('${guest}');
    SELECT id FROM register_project('${teamEvent}','${owner}','owner',null,'Yaris Proje','Yaris Ekip','Eszamanli ekip testi.',201,'race/repo','https://github.com/race/repo','main',null,null);`, database)
    .match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)[0];
  psql(`SELECT join_project_by_code((SELECT invite_code FROM projects WHERE id='${teamProject}'),'${member}','member',null);`, database);
  const oldCode = psql(`SELECT invite_code FROM projects WHERE id='${teamProject}';`, database).match(/[0-9a-f]{18}/)[0];
  const later = (ms, sql) => new Promise(r => setTimeout(r, ms)).then(() => asyncPsql(sql));
  const [renewal, lateJoin] = await Promise.allSettled([
    asyncPsql(`BEGIN; SELECT renew_invite('${teamProject}','${owner}','${"d".repeat(18)}'); SELECT pg_sleep(0.6); COMMIT;`),
    later(150, `SELECT join_project_by_code('${oldCode}','${guest}','guest',null);`),
  ]);
  assert.equal(renewal.status, "fulfilled");
  assert.equal(lateJoin.status, "rejected", "Davet yenilenirken eski kodla katılım kabul edildi.");
  assert.match(lateJoin.reason.stderr, /Davet/);
  console.log("PASS: Davet yenilenirken bekleyen eski kodlu katılım reddedildi.");
  const [transfer, staleWithdraw] = await Promise.allSettled([
    asyncPsql(`BEGIN; SELECT transfer_project_owner('${teamProject}','${owner}','${member}'); SELECT pg_sleep(0.6); COMMIT;`),
    later(150, `SELECT withdraw_project('${teamProject}','${owner}','Yaris Proje');`),
  ]);
  assert.equal(transfer.status, "fulfilled");
  assert.equal(staleWithdraw.status, "rejected", "Kuruculuk devredilirken eski kurucu projeyi sildi.");
  assert.match(staleWithdraw.reason.stderr, /yalnızca kurucu/);
  console.log("PASS: Kuruculuk devri sırasında eski kurucunun silme isteği reddedildi.");

  // Oylama kapanışı: sonuçlandırma devam eden oyu bekler; sonrasında gelen oy reddedilir.
  const voteEvent = "20000000-0000-0000-0000-000000000020";
  const [author, voterA, voterB, organizer] = ["20000000-0000-0000-0000-000000000021", "20000000-0000-0000-0000-000000000022", "20000000-0000-0000-0000-000000000023", "20000000-0000-0000-0000-000000000024"];
  // Yönetim RPC'leri yalnızca etkinliğin topluluğundaki organizatöre açık: etkinlik DEÜ CS&AI'ya bağlanır.
  const voteProject = psql(`INSERT INTO events(id,slug,title,starts_at,deadline,community_id) VALUES('${voteEvent}','vote-race','Oy Yarışı',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',(SELECT id FROM communities WHERE slug='deu-csai'));
    INSERT INTO auth.users(id) VALUES('${author}'),('${voterA}'),('${voterB}'),('${organizer}');
    INSERT INTO community_members(community_id,user_id,github_login,role) SELECT id,'${organizer}','admin','organizator' FROM communities WHERE slug='deu-csai';
    SELECT id FROM register_project('${voteEvent}','${author}','author',null,'Oy Proje','Oy Ekip','Eşzamanlı oy testi.',301,'vote/repo','https://github.com/vote/repo','main',null,repeat('a',40));`, database)
    .match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)[0];
  psql(`SELECT complete_submission(id, lease_token, 'teslim/'||id||'.zip', repeat('a',64), 10) FROM claim_delivery_jobs('${voteProject}',1);
    SELECT lock_delivery_event('${voteEvent}','test',true);
    SELECT enqueue_seals('${voteEvent}');
    SELECT complete_seal(id, lease_token) FROM claim_delivery_jobs('${voteProject}',1);
    UPDATE events SET voting='acik' WHERE id='${voteEvent}';`, database);
  const vote = user => `INSERT INTO votes(event_id,user_id,project_id,github_login) VALUES('${voteEvent}','${user}','${voteProject}','v');`;
  const [slowVote, finalize] = await Promise.allSettled([
    asyncPsql(`BEGIN; ${vote(voterA)} SELECT pg_sleep(0.6); COMMIT;`),
    later(150, `SELECT admin_update_event('${voteEvent}','${organizer}','admin','voting','{"voting":"sonuclandi"}'); SELECT vote_tallies('${voteEvent}');`),
  ]);
  assert.equal(slowVote.status, "fulfilled");
  assert.equal(finalize.status, "fulfilled");
  assert.match(finalize.value.stdout, /"[0-9a-f-]{36}": 1/, "Sonuçlandırma devam eden oyu beklemedi.");
  const lateVote = await asyncPsql(vote(voterB)).then(() => null, e => e);
  assert.ok(lateVote && /Oylama açık değil/.test(lateVote.stderr), "Sonuçlandıktan sonra oy kabul edildi.");
  const total = psql(`SELECT count(*) FROM votes WHERE event_id='${voteEvent}';`, database);
  assert.match(total, /^\s*1\s*$/m);
  console.log("PASS: Sonuçlandırma bekleyen oyu bekledi; toplam kapanıştan sonra değişmedi.");
  await testCommunityRaces({ psql, asyncPsql, database });
  // Plan 4 aktivasyonu: belgeler yayınlanır, 0018 uygulanır; zorunluluk ve yarış testleri bundan sonra çalışır.
  for (const file of ["tests/database-policies-setup.sql", "supabase/migrations/0018_sozlesme_zorunlulugu.sql", "tests/database-policies-enforced.sql", "tests/database-policy-privacy.sql",
    // Plan 5: marka/özellik (0019) ve saklama defteri (0020); süreli silme aktivasyonu (0021) en son.
    "supabase/migrations/0019_marka_ve_ozellikler.sql", "tests/database-branding.sql"]) {
    run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-f", resolve(file)]);
  }
  console.log("Sözleşme zorunluluğu testleri geçti.");
  await testPolicyRaces({ psql, asyncPsql, database });
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  if (started) {
    if (database && /^muhur_test_\d+$/.test(database)) {
      try { psql(`DROP DATABASE ${database};`); } catch { /* Yalnızca bu çalışmanın test veritabanı. */ }
    }
    try { run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]); }
    catch { server?.kill(); }
  } else server?.kill();
  if (logFd !== undefined) closeSync(logFd);
}
