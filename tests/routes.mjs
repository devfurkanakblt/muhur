import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const session = await (await fetch("http://127.0.0.1:54330/fixture/session")).json();
mkdirSync("test-artifacts", { recursive: true });
const cases = [
  { path: "/panel", mode: "open", name: "panel-open", expected: ["Teslim sürümü kabul edildi", "Teslim sürümünü güncelle", "geri alınamaz", "Kuruculuğu devret"] },
  { path: "/", mode: "open", name: "gallery", expected: ["Proje veya ekip ara", "Sıralama", "gallery-search"] },
  { path: "/panel", mode: "sealed", name: "panel-sealed", expected: ["Arşiv doğrulandı", "Mühür makbuzu"] },
  { path: "/yonetim", mode: "sealed", name: "admin", expected: ["Jüri paketi", "Jüri ödülleri", "Son başarılı çalışma"] },
  { path: "/sahne", mode: "sealed", name: "stage", expected: ["Vitrini açan karekod", "Vitrini aç", "Sahneye dön"] },
  { path: "/", mode: "sealed", name: "winners", expected: ["id=\"kazananlar\"", "Kazananları gör", "Örnek · En iyi teknik çözüm"] },
  { path: "/panel", mode: "failed", name: "panel-failed", expected: ["Teslimde sorun var", "Arşiv deposuna ulaşılamadı"] },
  { path: "/sergi/ornek-etkinlik/1", mode: "failed", name: "exhibit", expected: ["Demoyu aç", "Örnek · Akıllı Kampüs"] },
];
for (const item of cases) {
  await fetch(`http://127.0.0.1:54330/fixture/state?mode=${item.mode}`);
  const response = await fetch(`http://127.0.0.1:3100${item.path}`, { headers: { Cookie: `${session.name}=${session.value}` } });
  const html = await response.text();
  writeFileSync(resolve("test-artifacts", `${item.name}.html`), html);
  assert.equal(response.status, 200, `${item.path} HTTP ${response.status}`);
  for (const expected of item.expected) assert.ok(html.includes(expected), `${item.path}: '${expected}' bulunamadı.`);
  console.log(`PASS: ${item.name}`);
}
await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed");
const anonymous = await fetch("http://127.0.0.1:3100/yonetim");
assert.equal(anonymous.status, 404, "Anonim ziyaretçi yönetim sayfasını görebiliyor.");
const denied = await fetch("http://127.0.0.1:3100/api/juri/ornek-etkinlik");
assert.equal(denied.status, 403);
const unauthorizedArchive = await fetch("http://127.0.0.1:3100/api/arsiv/30000000-0000-0000-0000-000000000001");
assert.equal(unauthorizedArchive.status, 403);
console.log("PASS: Anonim yönetim, jüri paketi ve arşiv erişimi reddedildi.");
const csv = await fetch("http://127.0.0.1:3100/api/juri/ornek-etkinlik?format=csv", { headers: { Cookie: `${session.name}=${session.value}` } });
assert.equal(csv.status, 200);
assert.ok((await csv.text()).includes("Örnek Ekip"));
console.log("PASS: Yönetici CSV teslim listesi indirebiliyor.");
// Telegram duyurusunun görseli: herkese açık kazanan kartı PNG; bilinmeyen kazanan 404.
const card = await fetch("http://127.0.0.1:3100/api/kazanan/a1");
assert.equal(card.status, 200);
assert.equal(card.headers.get("content-type"), "image/png");
assert.deepEqual([...new Uint8Array(await card.arrayBuffer()).slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
assert.equal((await fetch("http://127.0.0.1:3100/api/kazanan/yok")).status, 404);
console.log("PASS: Kazanan kartı PNG olarak üretiliyor; bilinmeyen kazanan 404.");
