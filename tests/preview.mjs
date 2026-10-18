// Yalnızca yerel arayüz kontrolü: canlı hesap veya veri kullanılmaz, üretim rotası eklemez.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import sharp from "sharp";

const now = Date.now();
const stamp = n => new Date(now + n).toISOString();
const userId = "00000000-0000-0000-0000-000000000001";
const eventId = "10000000-0000-0000-0000-000000000001";
let mode = "open";
// Örnek logolar (512×512): biri PNG, biri WEBP; üçüncü eserin logosu yok. Depo adresinden sunulur.
const logoSvg = shape => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${shape}</svg>`);
const logos = {
  "fixture/logo-1.png": { type: "image/png", bytes: await sharp(logoSvg(`<circle cx="256" cy="256" r="230" fill="#1f8a70"/><rect x="146" y="146" width="220" height="220" rx="36" fill="#f6f1e7"/><circle cx="256" cy="256" r="58" fill="#1f8a70"/>`)).png().toBuffer() },
  "fixture/logo-2.webp": { type: "image/webp", bytes: await sharp(logoSvg(`<path d="M256 24 488 256 256 488 24 256Z" fill="#e2712b"/><path d="M256 136 376 256 256 376 136 256Z" fill="#2b2d42"/>`)).webp().toBuffer() },
};
let activity = null;
// Gizem avcıları: claim_mystery RPC ile bellekte tutulur, mod değişince sıfırlanır.
let hunters = [];
// Halkın seçimi oyları: oylama açıkken (voting) yazılabilir, mod değişince sıfırlanır.
const sealedVotes = () => mode === "sealed" ? [{ event_id: eventId, user_id: "visitor", project_id: "30000000-0000-0000-0000-000000000001" }] : [];
let votes = [];
// Jüri ödülleri: kilitli modlarda admin_add_award / admin_remove_award ile bellekte tutulur, mod değişince sıfırlanır.
const sealedAwards = () => mode === "sealed" ? [{ id: "a1", event_id: eventId, project_id: "30000000-0000-0000-0000-000000000001", title: "Örnek · En iyi teknik çözüm", reason: "Bu gerekçe yerel arayüz kontrolü için oluşturulmuş örnektir.", created_at: stamp(-20_000) }] : [];
let awards = [];
let awardSeq = 1;
// Yönetici oturumunun açılış zamanı (A21): ?oturum=eski 13 saat önce açılmış oturum verir.
const fixtureAmr = url => [{ method: "oauth", timestamp: Math.floor((url.searchParams.get("oturum") === "eski" ? Date.now() - 13 * 3600_000 : Date.now()) / 1000) }];
const mascotProposals = [
  { id: "81000000-0000-0000-0000-000000000001", event_id: eventId, author_id: userId, author_login: "preview-admin", name: "Mırmır", visible: true, created_at: stamp(-240_000) },
  { id: "81000000-0000-0000-0000-000000000002", event_id: eventId, author_id: "00000000-0000-0000-0000-000000000002", author_login: "ornek-katilimci", name: "Kıvılcım", visible: true, created_at: stamp(-180_000) },
  { id: "81000000-0000-0000-0000-000000000003", event_id: eventId, author_id: "00000000-0000-0000-0000-000000000003", author_login: "ornek-yarismaci", name: "Nöron", visible: true, created_at: stamp(-120_000) },
];
const mascotVotes = [
  { event_id: eventId, voter_id: "00000000-0000-0000-0000-000000000010", proposal_id: mascotProposals[0].id },
  { event_id: eventId, voter_id: "00000000-0000-0000-0000-000000000011", proposal_id: mascotProposals[1].id },
  { event_id: eventId, voter_id: "00000000-0000-0000-0000-000000000012", proposal_id: mascotProposals[1].id },
];
const member = { user_id: userId, github_login: "preview-admin", avatar_url: null, role: "owner", event_id: eventId };
const user = { id: userId, aud: "authenticated", role: "authenticated", email: "preview@example.com", app_metadata: { provider: "github" }, user_metadata: { user_name: "preview-admin" }, identities: [{ provider: "github", id: "424242", identity_data: { provider_id: "424242", user_name: "preview-admin" } }], created_at: stamp(-3600_000) };
function records(table) {
  const locked = mode !== "open";
  const projects = Array.from({ length: 3 }, (_, i) => ({
    id: `30000000-0000-0000-0000-00000000000${i + 1}`, event_id: eventId, exhibit_no: i + 1,
    name: ["Örnek · Akıllı Kampüs", "Örnek · Mühür Arşivi", "Örnek · Uzun Bir Proje Adıyla Erişilebilirlik Denemesi"][i],
    team_name: ["Örnek Ekip", "Arşiv Ekibi", "Düşün, Bağlan, Üret"][i], summary: "Bu kayıt yalnızca yerel arayüz testinde kullanılan örnek bir projedir. Gerçek bir teslim değildir.",
    demo_url: i === 0 ? "https://example.com/demo" : null, logo_path: [`fixture/logo-1.png`, `fixture/logo-2.webp`, null][i], repo_id: 100 + i,
    repo_full_name: `preview/project-${i}`, repo_url: `https://github.com/preview/project-${i}`, default_branch: "main",
    invite_code: "preview-invite", created_by: userId, created_at: stamp(-3600_000), updated_at: stamp(-300_000),
    last_pushed_at: stamp(-120_000), health_checked_at: stamp(-30_000), health_issues: mode === "failed" ? ["erisilemiyor"] : [],
    repo_head_sha: "a".repeat(40), repo_created_at: stamp(-7200_000), pre_event_commits: false, repo_size_kb: 100,
    accepted_sha: "a".repeat(40), accepted_at: stamp(-300_000), accepted_branch: "main", accepted_archive_sha256: "b".repeat(64), accepted_archive_bytes: 25000,
    accepted_archive_path: "teslim/fixture.zip",
    archive_path: ["sealed", "voting"].includes(mode) ? "teslim/fixture.zip" : null, archive_sha256: ["sealed", "voting"].includes(mode) ? "b".repeat(64) : null,
    archive_bytes: mode === "sealed" ? 25000 : null, frozen_sha: mode === "sealed" ? "a".repeat(40) : null,
    frozen_at: mode === "sealed" ? stamp(-60_000) : null, frozen_method: mode === "sealed" ? "accepted" : null,
    freeze_error: mode === "failed" ? "Arşiv deposuna ulaşılamadı. Kabul edilmiş sürüm korunuyor." : null,
    delivery_error: null, members: [{ ...member, project_id: `30000000-0000-0000-0000-00000000000${i + 1}` }, { user_id: "00000000-0000-0000-0000-000000000002", github_login: "preview-member", role: "member", avatar_url: null }],
    snapshots: [{ sha: "a".repeat(40), last_seen_at: stamp(-600_000) }],
  }));
  const tables = {
    events: [{ id: eventId, slug: "ornek-etkinlik", title: "Örnek Hackathon · Yerel Test", starts_at: stamp(-7200_000), deadline: locked ? stamp(-60_000) : stamp(45 * 60_000), locked_at: locked ? stamp(-60_000) : null,
      is_current: true, announcement: "Örnek duyuru: son push'tan sonra teslim sürümünü güncelle.", announcement_at: stamp(-600_000), activity_kind: activity?.kind ?? null, activity_title: activity?.title ?? null, activity_at: activity?.at ?? null, voting: mode === "voting" ? "acik" : locked ? "sonuclandi" : "kapali" }],
    projects,
    project_members: [
      { ...member, project_id: projects[0].id, project: { team_name: projects[0].team_name } },
      // Diğer ekiplerin üyeleri: kazanan gösterisindeki ekip listesi için (avatarsız üye baş harfle görünür).
      ...[[0, "preview-member"], [1, "ayse-arsiv"], [1, "mehmet-k"], [2, "zeynep-dbu"], [2, "can-uretir"], [2, "elif-baglar"]].map(([i, login], n) => ({
        user_id: `00000000-0000-0000-0000-00000000010${n}`, github_login: login, avatar_url: null, role: n === 0 ? "member" : "owner", event_id: eventId,
        project_id: projects[i].id, project: { team_name: projects[i].team_name },
      })),
    ],
    mystery_hunters: hunters,
    project_timeline: [{ id: "t1", project_id: projects[0].id, kind: "accepted", detail: "a".repeat(40), occurred_at: stamp(-300_000) }, { id: "t2", project_id: projects[0].id, kind: "snapshot", detail: "a".repeat(40), occurred_at: stamp(-600_000) }],
    delivery_jobs: mode === "failed" ? [{ id: "j1", project_id: projects[0].id, event_id: eventId, kind: "seal", state: "failed", attempts: 5, error: "Depo bağlantısı başarısız.", next_attempt_at: stamp(0), created_at: stamp(-30_000), project: { name: projects[0].name, team_name: projects[0].team_name }, event: { title: "Örnek Hackathon" } }] : [],
    worker_runs: [{ id: "r1", started_at: stamp(-30_000), finished_at: stamp(-15_000), processed: 3, error: null }],
    awards,
    votes,
    mascot_naming_rounds: [{ event_id: eventId, phase: mode === "voting" ? "oylama" : mode === "sealed" ? "sonuc" : "oneriler" }],
    mascot_name_proposals: mascotProposals,
    mascot_name_votes: mode === "voting" || mode === "sealed" ? mascotVotes : [],
  };
  return tables[table] ?? [];
}
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:54330");
  response.setHeader("Content-Type", "application/json");
  if (url.pathname === "/fixture/login") {
    const part = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const access_token = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: userId, exp: Math.floor(now / 1000) + 7200, role: "authenticated", amr: fixtureAmr(url) })}.${Buffer.from("fixture-signature").toString("base64url")}`;
    const session = { access_token, refresh_token: "fixture", expires_at: Math.floor(now / 1000) + 7200, expires_in: 7200, token_type: "bearer", user };
    const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}; path=/; SameSite=Lax`;
    const next = url.searchParams.get("next") ?? "/panel";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/panel";
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    return response.end(`<html><body><script>document.cookie=${JSON.stringify(cookie)};location.href=${JSON.stringify(`http://127.0.0.1:3100${safeNext}`)};</script></body></html>`);
  }
  if (url.pathname === "/fixture/state") {
    mode = ["open", "sealed", "failed", "voting"].includes(url.searchParams.get("mode")) ? url.searchParams.get("mode") : "open";
    hunters = [];
    votes = sealedVotes();
    awards = sealedAwards();
    return response.end(JSON.stringify({ mode }));
  }
  if (url.pathname === "/fixture/session") {
    const part = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const access_token = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: userId, exp: Math.floor(now / 1000) + 7200, role: "authenticated", amr: fixtureAmr(url) })}.${Buffer.from("fixture-signature").toString("base64url")}`;
    const session = { access_token, refresh_token: "fixture", expires_at: Math.floor(now / 1000) + 7200, expires_in: 7200, token_type: "bearer", user };
    return response.end(JSON.stringify({ name: "sb-127-auth-token", value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}` }));
  }
  if (url.pathname.startsWith("/storage/v1/object/public/logos/")) {
    const logo = logos[url.pathname.slice("/storage/v1/object/public/logos/".length)];
    if (!logo) { response.statusCode = 404; return response.end("{}"); }
    response.setHeader("Content-Type", logo.type);
    return response.end(logo.bytes);
  }
  if (url.pathname === "/auth/v1/user") return response.end(JSON.stringify(user));
  // Yemek/oyun duyurusu yerelde bellekte tutulur; sayfa yenilenince maskot değişimi görülebilir.
  if (url.pathname === "/rest/v1/rpc/admin_update_event") {
    const body = JSON.parse(await new Promise(done => { let b = ""; request.on("data", c => b += c); request.on("end", () => done(b)); }) || "{}");
    if ("activity" in (body.p_changes ?? {})) activity = body.p_changes.activity ? { ...body.p_changes.activity, at: new Date().toISOString() } : null;
    return response.end("null");
  }
  // Browser UI tests can reach a normal action error without a real database lease.
  if (url.pathname === "/rest/v1/rpc/try_worker_lease") return response.end("true");
  // Oy toplamları DB'de sayılır (vote_tallies RPC); fikstür aynı sonucu örnek oylardan üretir.
  if (url.pathname === "/rest/v1/rpc/vote_tallies") {
    const tallies = {};
    if (records("events")[0].voting === "sonuclandi") for (const v of records("votes")) tallies[v.project_id] = (tallies[v.project_id] ?? 0) + 1;
    return response.end(JSON.stringify(tallies));
  }
  if (url.pathname === "/rest/v1/rpc/claim_mystery") {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      if (mode !== "open") {
        response.statusCode = 400;
        return response.end(JSON.stringify({ message: "MYSTERY: Gizem yalnızca hackathon saatlerinde açık.", code: "P0001" }));
      }
      const { p_event, p_user, p_login } = JSON.parse(body || "{}");
      let row = hunters.find(h => h.user_id === p_user);
      if (!row) hunters.push(row = { event_id: p_event, user_id: p_user, github_login: p_login, found_at: new Date().toISOString() });
      response.end(JSON.stringify(row.found_at));
    });
    return;
  }
  // Jüri ödülü ekleme/kaldırma: ödül adı etkinlikte tekildir (23505), yalnızca kilitli modlarda.
  if (["/rest/v1/rpc/admin_add_award", "/rest/v1/rpc/admin_remove_award"].includes(url.pathname)) {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      const args = JSON.parse(body || "{}");
      if (url.pathname.endsWith("remove_award")) {
        const before = awards.length;
        awards = awards.filter(a => a.id !== args.p_award);
        return response.end(JSON.stringify(awards.length < before));
      }
      if (mode === "open") { response.statusCode = 400; return response.end(JSON.stringify({ message: "Etkinlik kilitli değil.", code: "P0001" })); }
      if (awards.some(a => a.title === args.p_title)) {
        response.statusCode = 409; return response.end(JSON.stringify({ message: "duplicate key value violates unique constraint", code: "23505" }));
      }
      const id = `40000000-0000-0000-0000-${String(awardSeq++).padStart(12, "0")}`;
      awards = [...awards, { id, event_id: args.p_event, project_id: args.p_project, title: args.p_title, reason: args.p_reason, created_at: new Date().toISOString() }];
      response.end(JSON.stringify(id));
    });
    return;
  }
  // Oy yazımı: upsert (event_id, user_id) ve filtreli silme; guard_votes tetikleyicisinin kuralları taklit edilir.
  if (url.pathname === "/rest/v1/votes" && ["POST", "DELETE"].includes(request.method)) {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      const reject = message => { response.statusCode = 400; response.end(JSON.stringify({ message: `VOTING: ${message}`, code: "P0001" })); };
      if (mode !== "voting") return reject("Oylama açık değil.");
      if (request.method === "DELETE") {
        const filters = [...url.searchParams].filter(([, f]) => f.startsWith("eq.")).map(([key, f]) => [key, f.slice(3)]);
        votes = votes.filter(row => !filters.every(([key, value]) => String(row[key]) === value));
        response.statusCode = 204;
        return response.end();
      }
      const row = JSON.parse(body || "{}");
      if (!records("projects").some(p => p.id === row.project_id && p.archive_sha256)) return reject("Yalnızca mühürlü eserlere oy verilebilir.");
      if (records("project_members").some(m => m.project_id === row.project_id && m.user_id === row.user_id)) return reject("Kendi ekibine oy veremezsin.");
      votes = [...votes.filter(v => !(v.event_id === row.event_id && v.user_id === row.user_id)), row];
      response.statusCode = 201;
      response.end();
    });
    return;
  }
  if (url.pathname === "/rest/v1/rpc/mascot_name_tallies") {
    return response.end(JSON.stringify(mascotProposals.map(p => ({
      proposal_id: p.id,
      vote_count: records("mascot_name_votes").filter(v => v.proposal_id === p.id).length,
    }))));
  }
  if (!url.pathname.startsWith("/rest/v1/") || !["GET", "HEAD"].includes(request.method)) {
    response.statusCode = 405; return response.end(JSON.stringify({ message: "Yerel test verisi salt okunur.", code: "FIXTURE_READ_ONLY" }));
  }
  const table = url.pathname.split("/").at(-1);
  let rows = records(table);
  for (const [key, filter] of url.searchParams) {
    if (filter.startsWith("eq.")) rows = rows.filter(row => String(row[key]) === filter.slice(3));
    if (filter.startsWith("in.(")) { const set = filter.slice(4, -1).split(",").map(v => v.replace(/^"|"$/g, "")); rows = rows.filter(row => set.includes(String(row[key]))); }
    if (filter === "is.null") rows = rows.filter(row => row[key] == null);
    if (filter === "not.is.null") rows = rows.filter(row => row[key] != null);
  }
  response.setHeader("Content-Range", `0-${Math.max(0, rows.length - 1)}/${rows.length}`);
  if (request.method === "HEAD") return response.end();
  if (request.headers.accept?.includes("application/vnd.pgrst.object+json")) return response.end(JSON.stringify(rows[0] ?? null));
  response.end(JSON.stringify(rows));
});
await new Promise(resolve => server.listen(54330, "127.0.0.1", resolve));
// MUHUR_PREVIEW_PROD=1: önce aynı ortamla `next build`, sonra `next start` (üretim CSP'si ve derlemesi).
const prod = process.env.MUHUR_PREVIEW_PROD === "1";
const app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), prod ? "start" : "dev", "-p", "3100"], {
  windowsHide: true, stdio: "inherit", env: { ...process.env, NODE_ENV: prod ? "production" : "development", MUHUR_TEST_PREVIEW: "1",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54330", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-key", ADMIN_GITHUB_IDS: "424242", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
    GITHUB_TOKEN: "", TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "", CRON_SECRET: "fixture-cron",
  },
});
console.log("Yerel örnek arayüz: http://127.0.0.1:3100 (canlı veri kullanılmıyor)");
function stop() { app.kill(); server.close(); }
process.on("SIGINT", stop); process.on("SIGTERM", stop); app.on("exit", () => server.close());
process.stdin.on("data", chunk => { if (chunk.toString().trim() === "stop") stop(); });
