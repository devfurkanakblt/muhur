// Plan 5 rota kontrolleri: marka, özellik ve maskot yalıtımı. `npm run preview:test` açıkken çalışır (sahte Supabase).
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const session = await (await fetch("http://127.0.0.1:54330/fixture/session")).json();
const htmlOf = async (path, init) => (await fetch(`http://127.0.0.1:3100${path}`, init)).text();
const hubAuth = { headers: { Cookie: `${session.name}=${session.value}` } };
mkdirSync("test-artifacts", { recursive: true });
// Plan 5: marka ve özellikler. İkinci etkinlik başka topluluğa aittir; özellikleri kapalı, kendi rengi ve logosu var.
const MASCOT_MARK = "M280 29C283 32"; // components/mascot/paths.ts BODY_FILL başlangıcı
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&coklu=1&rol=sahip");
const deuPage = await htmlOf("/e/ornek-etkinlik");
const otherPage = await htmlOf("/e/ikinci-etkinlik");
writeFileSync(resolve("test-artifacts", "plan5-deu.html"), deuPage);
writeFileSync(resolve("test-artifacts", "plan5-other.html"), otherPage);
assert.ok(deuPage.includes(MASCOT_MARK) && deuPage.includes('id="mystery-title"') && deuPage.includes('href="/e/ornek-etkinlik/maskot"'), "DEÜ etkinliğinde maskot/gizem/isimlendirme kayboldu.");
assert.ok(!otherPage.includes(MASCOT_MARK), "Başka topluluğun etkinlik sayfasında DEÜ maskotu var.");
assert.ok(!otherPage.includes('id="mystery-title"') && !otherPage.includes("/maskot\""), "Kapalı gizem/maskot başka toplulukta monte edildi.");
assert.ok(otherPage.includes("Başka Topluluk") && otherPage.includes("İkinci Hackathon · Yerel Test") && otherPage.includes("0123456789abcdef01234567.webp"), "İkinci topluluğun adı/etkinlik adı/logosu başlıkta yok.");
assert.ok(otherPage.includes("--accent-light:#0f766e") && !deuPage.includes("--accent-light:#0f766e"), "Etkinlik rengi kendi kapsamına yazılmadı ya da diğer etkinliğe taştı.");
assert.ok(!/:root[^{]*\{[^}]*--indigo:\s*#0f766e/.test(otherPage), "Kök --indigo etkinlik rengiyle yeniden atandı.");
for (const page of [deuPage, otherPage]) {
  assert.ok(page.includes("DEÜ CS&amp;AI topluluğu tarafından geliştirildi") && page.includes('href="/kosullar/platform/test-1"') && page.includes('href="/gizlilik"'), "Platform alt bilgisi eksik.");
}
for (const path of ["/e/ikinci-etkinlik/panel", "/e/ikinci-etkinlik/belge", "/sergi/ikinci-etkinlik/1"]) {
  const html = await htmlOf(path, hubAuth);
  writeFileSync(resolve("test-artifacts", `plan5-other-${path.split("/").slice(2).join("-")}.html`), html);
  assert.ok(!html.includes(MASCOT_MARK), `${path}: DEÜ maskotu başka toplulukta görünüyor.`);
}
const otherMissing = await fetch("http://127.0.0.1:3100/e/ikinci-etkinlik/maskot");
assert.equal(otherMissing.status, 404);
assert.ok(!(await otherMissing.text()).includes(MASCOT_MARK), "Başka topluluğun 404 ekranında DEÜ maskotu var.");
const mysteryBadge = await (await fetch("http://127.0.0.1:3100/api/rozet/ikinci-etkinlik/1/gizem")).text();
assert.ok(mysteryBadge.includes("kapalı"), "Kapalı gizemin rozeti 'kapalı' demiyor.");
const [deuStatus, otherStatus] = await Promise.all(["ornek-etkinlik", "ikinci-etkinlik"].map(async slug => (await (await fetch(`http://127.0.0.1:3100/api/durum?e=${slug}`)).json()).version));
assert.notEqual(deuStatus, otherStatus, "İki etkinliğin canlı durum sürümü aynı.");
for (const [name, path] of [["plan5-og-other", "/e/ikinci-etkinlik/opengraph-image"], ["plan5-og-deu", "/e/ornek-etkinlik/opengraph-image"], ["plan5-og-exhibit-other", "/sergi/ikinci-etkinlik/1/opengraph-image"]]) {
  const image = await fetch(`http://127.0.0.1:3100${path}`);
  assert.equal(image.status, 200, `${path} HTTP ${image.status}`);
  assert.equal(image.headers.get("content-type"), "image/png");
  writeFileSync(resolve("test-artifacts", `${name}.png`), new Uint8Array(await image.arrayBuffer()));
}
assert.equal((await fetch("http://127.0.0.1:3100/e/ikinci-etkinlik/yonetim", hubAuth)).status, 404, "Başka topluluğun sahibi olmayan yönetim sayfasını görüyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&rol=sahip");
const deuAdmin = await htmlOf("/e/ornek-etkinlik/yonetim", hubAuth);
assert.ok(deuAdmin.includes("Görünüm ve özellikler") && deuAdmin.includes('name="feature_mascot_naming"') && deuAdmin.includes("Platform rengini kullan"), "Etkinlik görünüm formu yok.");
const brandForm = await htmlOf("/topluluk/deu-csai", hubAuth);
assert.ok(brandForm.includes("Topluluk markası") && brandForm.includes('name="logo"') && !brandForm.includes('name="contact_email"'), "Topluluk marka formu yok ya da iletişim alanı içeriyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed");
const sealedAdmin = await htmlOf("/e/ornek-etkinlik/yonetim", hubAuth);
assert.ok(sealedAdmin.includes("Görünüm kilit anında dondu") && !sealedAdmin.includes("Görünümü kaydet"), "Kilitli etkinlikte görünüm formu hâlâ açık.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
console.log("PASS: Plan 5 marka/özellik yalıtımı: DEÜ maskotu ve kapalı özellikler başka topluluğa sızmıyor; renk kendi kapsamında.");
