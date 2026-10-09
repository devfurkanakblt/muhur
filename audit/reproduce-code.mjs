// Kaynak dosyaları değiştirmeden, yalnızca yerel sahte bağımlılıklarla bulgu doğrulama.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { execFileSync } from "node:child_process";
import { createServerClient } from "@supabase/ssr";

const nativeRequire = createRequire(import.meta.url);
function load(file, dependencies) {
  const source = transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, require: name => dependencies[name] ?? nativeRequire(name),
    Date, URL, TextEncoder, Uint8Array, DataView, AbortSignal, console,
  }, { filename: file });
  return exports;
}

const user = { id: "regular-fixture-user", user_metadata: { user_name: "participant" } };
const dbWrites = [];
const db = { from: table => ({ update: values => ({ eq: async (...where) => {
  dbWrites.push({ table, values, where }); return { error: null };
} }) }) };
const data = load("lib/data.ts", {
  "server-only": {}, react: { cache: fn => fn },
  "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
  "@/lib/env": { env: { adminLogins: ["organizer-fixture"] } },
});
assert.equal((await data.getViewer()).isAdmin, false);
user.user_metadata.user_name = "organizer-fixture";
assert.equal((await data.getViewer()).isAdmin, true);
console.log("OBSERVED A01: Aynı normal kullanıcı, yalnızca user_metadata değişince yönetici sayıldı.");

const actions = load("app/actions.ts", {
  "next/server": { after: () => {} }, "next/cache": { revalidatePath: () => {} },
  "next/headers": {}, "next/navigation": {},
  "@/lib/supabase/server": { createAdminClient: () => db },
  "@/lib/data": { getViewer: data.getViewer, getEvent: async () => ({ id: "fixture-event" }) },
  "@/lib/github": {}, "@/lib/freeze": {}, "@/lib/delivery": {}, "@/lib/delivery-policy": {},
  "@/lib/logo-spec": load("lib/logo-spec.ts", {}),
  "@/lib/notify": {}, "@/lib/env": {},
});
const form = new FormData(); form.set("announcement", "Yerel denetim duyurusu");
assert.equal((await actions.setAnnouncement(undefined, form)).ok, true);
assert.equal(dbWrites[0].table, "events");
console.log("OBSERVED A01: Gerçek setAnnouncement aksiyonu bu kimlikle service-role yazma yoluna ulaştı; canlı yazma yapılmadı.");

const github = load("lib/github.ts", { "server-only": {}, "@/lib/env": { env: {} } });
assert.equal(await github.canClaimRepo({ owner: { login: "organizer-fixture" } }, (await data.getViewer()).login), true);
console.log("OBSERVED A02: Değiştirilebilir kullanıcı adıyla repo sahipliği, GitHub token kontrolü olmadan kabul edildi.");

const policy = load("lib/delivery-policy.ts", {});
const core = load("lib/delivery-core.ts", { "./delivery-policy": policy });
const malformed = new Uint8Array(52);
const view = new DataView(malformed.buffer);
view.setUint32(0, 0x04034b50, true);
view.setUint32(30, 0x06054b50, true);
view.setUint16(38, 1, true); view.setUint16(40, 1, true);
view.setUint32(42, 46, true); view.setUint32(46, 30, true);
core.validateArchive(malformed);
const python = execFileSync("python", ["-c", "import sys,io,zipfile\ntry: zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).testzip()\nexcept zipfile.BadZipFile: print('REJECTED')\nelse: print('ACCEPTED')"], { input: malformed, encoding: "utf8", windowsHide: true });
assert.equal(python.trim(), "REJECTED");
console.log("OBSERVED A11: validateArchive, bağımsız ZIP okuyucusunun reddettiği bozuk merkezi dizini kabul etti.");

let query;
const partialRecord = { name: "Eksik mühür", team_name: "Örnek", exhibit_no: 1, frozen_sha: "a".repeat(40), frozen_at: null, archive_sha256: null, events: { title: "Test", slug: "test" } };
const lookup = load("app/dogrula/actions.ts", {
  "@/lib/data": { exhibitPath: (slug, no) => `/sergi/${slug}/${no}` },
  "@/lib/supabase/server": { createAdminClient: () => ({ from: () => ({ select: () => ({
    like: (column, value) => { query = { column, value }; return { limit: async () => ({ data: [partialRecord] }) }; },
  }) }) }) },
});
assert.equal((await lookup.lookupSeal("a".repeat(40))).length, 1);
assert.equal(query.column, "frozen_sha");
console.log("OBSERVED A10: Arşiv hash'i ve tamamlanmış mühür zamanı olmayan commit, doğrulama sonucuna girdi.");

const errorClient = { from: () => { const chain = {
  select: () => chain, eq: () => chain, order: async () => ({ data: null, error: { message: "fixture outage" } }),
}; return chain; } };
const errors = load("lib/data.ts", {
  "server-only": {}, react: { cache: fn => fn }, "@/lib/env": {},
  "@/lib/supabase/server": { createAdminClient: () => errorClient },
});
assert.equal((await errors.getExhibits("fixture-event")).length, 0);
console.log("OBSERVED A09: Gerçek getExhibits, veritabanı hatasını boş sergi sonucu olarak döndürdü.");

// Gerçek SSR SDK ve sahte OAuth yanıtı: tüm tokenlar denetim fixture'ıdır.
const part = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: "fixture-user", exp: Math.floor(Date.now()/1000)+3600 })}.fixture-signature`;
const writtenCookies = [];
const authClient = createServerClient("https://fixture.supabase.co", "fixture-key", {
  cookies: { getAll: () => [{ name: "sb-fixture-auth-token-code-verifier", value: `base64-${Buffer.from(JSON.stringify("fixture-code-verifier")).toString("base64url")}` }], setAll: entries => writtenCookies.push(...entries) },
  global: { fetch: async () => Response.json({ access_token: accessToken, refresh_token: "fixture-refresh", expires_in: 3600,
    token_type: "bearer", provider_token: "fixture-github-provider-token", user: { id: "fixture-user", app_metadata: { provider: "github" }, user_metadata: {} } }) },
});
const exchanged = await authClient.auth.exchangeCodeForSession("fixture-code");
assert.equal(exchanged.error, null);
const sessionCookie = writtenCookies.find(c => c.name === "sb-fixture-auth-token");
assert.ok(sessionCookie);
const sessionBytes = Buffer.from(sessionCookie.value.slice("base64-".length), "base64url").toString("utf8");
assert.equal(JSON.parse(sessionBytes).provider_token, "fixture-github-provider-token");
assert.equal(sessionCookie.options.httpOnly, false);
console.log("OBSERVED A13: Gerçek SSR SDK, OAuth provider_token değerini HttpOnly olmayan oturum çerezine de yazdı.");

const logoSpec = load("lib/logo-spec.ts", {});
const fakePng = new Uint8Array(24);
fakePng[0]=0x89; fakePng.set(new TextEncoder().encode("PNG"),1); fakePng.set(new TextEncoder().encode("IHDR"),12);
const pngView=new DataView(fakePng.buffer); pngView.setUint32(16,512); pngView.setUint32(20,512);
const dimensions=logoSpec.readImageSize(fakePng);
assert.equal(logoSpec.logoSizeError(dimensions.width,dimensions.height),null);
console.log("OBSERVED A14: 24 baytlık sahte PNG başlığı boyut kontrolünü geçti; görselin açılabilirliği doğrulanmıyor.");

const allVotes=Array.from({length:1501},(_,i)=>({project_id:i<501?"project-a":"project-b"}));
const limitedDb={from:()=>({select:()=>({eq:async()=>({data:allVotes.slice(0,1000),error:null})})})};
const votesData=load("lib/data.ts", {
  "server-only":{},react:{cache:fn=>fn},"@/lib/env":{},
  "@/lib/supabase/server":{createAdminClient:()=>limitedDb},
});
const truncated=await votesData.getVotes({id:"fixture-event",voting:"sonuclandi"},null);
assert.equal(truncated.tallies["project-a"],501);
assert.equal(truncated.tallies["project-b"],499);
console.log("OBSERVED A17: API 1000 satır döndürdüğünde gerçek getVotes, 1501 oylu senaryoda kazananı ters gösterecek toplam üretti (A=501/B=499; gerçekte B=1000).");
