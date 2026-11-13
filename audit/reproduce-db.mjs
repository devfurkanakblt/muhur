// Canli anahtar/bağlantı kullanmaz. Mevcut yerel test kümesini ayrı portta çalıştırır.
import { spawn, execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join } from "node:path";
import { existsSync, readdirSync, openSync, closeSync } from "node:fs";
import assert from "node:assert/strict";

const roots = process.platform === "win32" ? "C:/Program Files/PostgreSQL" : null;
const bin = process.env.POSTGRES_BIN ?? (roots && existsSync(roots) ? join(roots, readdirSync(roots).sort().reverse()[0], "bin") : "");
const exe = name => bin ? join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
const data = resolve(".test-db");
if (!existsSync(join(data, "PG_VERSION"))) throw new Error("Önce npm run test:db ile yerel test kümesini hazırla.");
const port = "54329";
const env = { ...process.env, PGCONNECT_TIMEOUT: "3", PGCLIENTENCODING: "UTF8" };
const run = (name, args, options = {}) => execFileSync(exe(name), args, { encoding: "utf8", windowsHide: true, timeout: 30_000, env, ...options });
const database = `muhur_audit_${Date.now()}`;
const connection = db => ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", db];
const psql = (sql, db=database) => run("psql", connection(db), { input: sql });
try { psql("select 1;", "postgres"); throw new Error("AUDIT_PORT_BUSY"); }
catch (error) { if (error.message === "AUDIT_PORT_BUSY") throw new Error("54329 zaten kullanılıyor; mevcut sunucuya dokunulmadı."); }
const logFd = openSync(resolve(".test-db/audit-server.log"), "a");
const server = spawn(exe("postgres"), ["-D", data, "-h", "127.0.0.1", "-p", port], { windowsHide: true, stdio: ["ignore", logFd, logFd] });
server.on("error", () => {});
let ready = false;
let created = false;
try {
  for (let attempt=0;attempt<15;attempt++) {
    await new Promise(resolve => setTimeout(resolve,500));
    try { psql("select 1;", "postgres"); ready=true; break; } catch { if (server.exitCode !== null) break; }
  }
  if (!ready) throw new Error("Yerel denetim PostgreSQL başlatılamadı.");
  psql(`CREATE DATABASE ${database};`, "postgres"); created=true;
  psql(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const file of ["0001_init.sql","0002_events.sql","0004_delivery.sql"]) {
    run("psql", [...connection(database),"-f",resolve("supabase/migrations",file)]);
  }
  run("psql", [...connection(database),"-f",resolve("audit/database.sql")]);
  console.log("Denetim SQL senaryoları izole veritabanında yeniden üretildi.");

  const eventId="20000000-0000-0000-0000-000000000001";
  const ownerId="20000000-0000-0000-0000-000000000002";
  const voterId="20000000-0000-0000-0000-000000000003";
  // 0001–0004 şemasında kayıt yalnızca tohum etkinliğine (2026-guz) açıktır; tohum satırı yarış etkinliğine çevrilir.
  psql(`ALTER TABLE events DISABLE TRIGGER USER;
    UPDATE events SET id='${eventId}',slug='race-test',title='Race Test',starts_at=clock_timestamp()-interval '1 hour',deadline=clock_timestamp()+interval '1 hour' WHERE slug='2026-guz';
    ALTER TABLE events ENABLE TRIGGER USER;
    INSERT INTO auth.users(id) VALUES('${ownerId}'),('${voterId}');`);
  const projectId=psql(`SELECT id FROM register_project('${eventId}','${ownerId}','owner',null,'Race Proje','Race Ekip','Vote close race test.',987,'owner/race','https://github.com/owner/race','main');`).split(/\r?\n/).map(x=>x.trim()).find(x=>/^[a-f0-9-]{36}$/.test(x));
  assert.ok(projectId);
  psql(`SELECT lock_delivery_event('${eventId}','audit',true); UPDATE events SET voting='acik' WHERE id='${eventId}';`);
  const vote=promisify(execFile)(exe("psql"), [...connection(database),"-c",`BEGIN; INSERT INTO votes(event_id,user_id,project_id,github_login) VALUES('${eventId}','${voterId}','${projectId}','voter'); SELECT pg_sleep(3); COMMIT;`], { windowsHide:true,encoding:"utf8",timeout:12_000,env:{...env,PGAPPNAME:"muhur-audit-vote"} });
  let sleeping=false;
  for(let attempt=0;attempt<20;attempt++) {
    await new Promise(resolve=>setTimeout(resolve,100));
    if (psql("SELECT count(*) FROM pg_stat_activity WHERE application_name='muhur-audit-vote' AND wait_event='PgSleep';").includes(" 1")) { sleeping=true;break; }
  }
  assert.ok(sleeping,"Oy işlemi bekleme noktasına ulaşmadı.");
  const start=Date.now();
  psql(`UPDATE events SET voting='sonuclandi' WHERE id='${eventId}';`);
  const elapsed=Date.now()-start;
  const before=psql(`SELECT count(*) FROM votes WHERE event_id='${eventId}';`);
  await vote;
  const after=psql(`SELECT count(*) FROM votes WHERE event_id='${eventId}';`);
  assert.ok(before.includes(" 0")); assert.ok(after.includes(" 1"));
  console.log(`OBSERVED A06: Oylama ${elapsed} ms içinde kapanıp 0 oy gösterdi; bekleyen oy commit olunca sonuç 1 oldu.`);
} catch(error) {
  console.error(error.stderr?.toString() || error.message); process.exitCode=1;
} finally {
  if(ready) {
    if(created && /^muhur_audit_\d+$/.test(database)) { try { psql(`DROP DATABASE ${database};`,"postgres"); } catch { /* yalnızca bu denetimin DB'si */ } }
    try { run("pg_ctl",["-D",data,"-m","fast","-w","stop"]); } catch { server.kill(); }
  } else server.kill();
  closeSync(logFd);
}
