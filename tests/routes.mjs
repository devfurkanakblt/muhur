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
// Çoklu topluluk: yetki etkinlik kapsamındadır; başka topluluğun organizatörü bu etkinliği göremez.
const auth = { headers: { Cookie: `${session.name}=${session.value}` }, redirect: "manual" };
await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed&rol=yabanci");
assert.equal((await fetch("http://127.0.0.1:3100/yonetim", auth)).status, 404, "Başka topluluğun organizatörü yönetim sayfasını açabiliyor.");
assert.equal((await fetch("http://127.0.0.1:3100/api/juri/ornek-etkinlik?format=csv", auth)).status, 403, "Başka topluluğun organizatörü jüri paketini indirebiliyor.");
assert.equal((await fetch("http://127.0.0.1:3100/api/arsiv/30000000-0000-0000-0000-000000000002", auth)).status, 403, "Başka topluluğun organizatörü başka ekibin arşivine erişebiliyor.");
assert.notEqual((await fetch("http://127.0.0.1:3100/api/arsiv/30000000-0000-0000-0000-000000000001", auth)).status, 403, "Ekip üyesi kendi arşivine erişemiyor.");
assert.ok(!(await (await fetch("http://127.0.0.1:3100/", auth)).text()).includes('href="/yonetim"'), "Yetkisiz kullanıcıya Yönetim bağlantısı görünüyor.");
console.log("PASS: Başka topluluğun organizatörü yönetim, jüri paketi ve başka ekibin arşivine erişemiyor.");
// Yalnızca head admin: inceler ama yönetemez (salt okunur; kilit, ödül, duyuru formları yok).
await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed&rol=head-admin");
const readOnly = await fetch("http://127.0.0.1:3100/yonetim", auth);
assert.equal(readOnly.status, 200);
const readOnlyHtml = await readOnly.text();
assert.ok(readOnlyHtml.includes("Salt okunur: bu etkinliği yönetme yetkin yok ya da etkinlik askıda."), "Head admin için salt okunur satırı yok.");
for (const hidden of ["Ödülü kaldır", "name=\"announcement\"", "name=\"slug\""]) assert.ok(!readOnlyHtml.includes(hidden), `Head admin yönetim formu görüyor: ${hidden}`);
assert.ok(readOnlyHtml.includes("Jüri paketi") && readOnlyHtml.includes("Kişisel veri silme"), "Head admin inceleme ve anonimleştirme bölümlerini görmüyor.");
assert.ok(readOnlyHtml.includes("Son başarılı çalışma"), "Head admin zamanlayıcı kayıtlarını görmüyor.");
assert.equal((await fetch("http://127.0.0.1:3100/api/juri/ornek-etkinlik?format=csv", auth)).status, 200);
console.log("PASS: Head admin yönetim sayfasını salt okur, jüri paketini indirebilir.");
// Head admin'in yalnızca platform yetkisiyle indirmeleri denetim kaydına girer; kendi ekibinin arşivi girmez.
const auditLog = async () => (await fetch("http://127.0.0.1:54330/fixture/audit")).json();
let audited = await auditLog();
assert.deepEqual(audited.map(a => [a.p_action, a.p_event, a.p_login]), [["jury_package_download", "10000000-0000-0000-0000-000000000001", "preview-admin"]], "Head admin jüri paketi indirmesi kaydedilmedi.");
assert.equal((await fetch("http://127.0.0.1:3100/api/arsiv/30000000-0000-0000-0000-000000000002", auth)).status, 307);
assert.equal((await fetch("http://127.0.0.1:3100/api/arsiv/30000000-0000-0000-0000-000000000001", auth)).status, 307);
audited = await auditLog();
assert.equal(audited.length, 2, "Head admin'in kendi ekibinin arşivi de kaydedildi ya da başka ekibinki kaydedilmedi.");
assert.deepEqual([audited[1].p_action, audited[1].p_project, audited[1].p_actor], ["archive_download", "30000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000001"]);
await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed&rol=head-admin&denetim=hata");
assert.equal((await fetch("http://127.0.0.1:3100/api/arsiv/30000000-0000-0000-0000-000000000002", auth)).status, 503, "Kayıt yazılamadan arşiv verildi.");
assert.equal((await fetch("http://127.0.0.1:3100/api/juri/ornek-etkinlik?format=csv", auth)).status, 503, "Kayıt yazılamadan jüri paketi verildi.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed");
assert.equal((await fetch("http://127.0.0.1:3100/api/juri/ornek-etkinlik?format=csv", auth)).status, 200);
assert.equal((await auditLog()).length, 0, "Topluluk rolüyle yapılan indirme kaydedildi.");
console.log("PASS: Head admin indirmeleri kayda girer; kayıt yazılamazsa indirme verilmez; topluluk rolü kaydedilmez.");
// Topluluk sahibi (head admin değil): yalnızca kendi etkinliğinin işlerini görür; platform geneli zamanlayıcı kayıtlarını görmez.
await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed&rol=sahip");
const ownerPage = await fetch("http://127.0.0.1:3100/yonetim", auth);
assert.equal(ownerPage.status, 200);
const ownerHtml = await ownerPage.text();
assert.ok(ownerHtml.includes("Kuyruğu şimdi işle") && ownerHtml.includes("Jüri ödülleri"), "Topluluk sahibi yönetim bölümlerini görmüyor.");
for (const hidden of ["Son başarılı çalışma", "Henüz başarılı zamanlayıcı çalışması yok"]) assert.ok(!ownerHtml.includes(hidden), `Topluluk sahibi zamanlayıcı kayıtlarını görüyor: ${hidden}`);
console.log("PASS: Topluluk sahibi platform geneli zamanlayıcı kayıtlarını görmüyor.");
// Jüri: kilitten sonra tek tek arşivleri indirebilir (kayıt gerekmez); kilitten önce indiremez.
await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed&rol=juri");
assert.equal((await fetch("http://127.0.0.1:3100/api/arsiv/30000000-0000-0000-0000-000000000002", auth)).status, 307, "Jüri kilitten sonra arşivi indiremiyor.");
assert.equal((await auditLog()).length, 0, "Jüri indirmesi head admin kaydı gibi yazıldı.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&rol=juri");
assert.equal((await fetch("http://127.0.0.1:3100/api/arsiv/30000000-0000-0000-0000-000000000002", auth)).status, 403, "Jüri kilitten önce başka ekibin arşivini indirebiliyor.");
console.log("PASS: Jüri kilitten sonra arşivleri indirir, önce indiremez.");
// Askı: herkes uyarıyı görür; gerekçe yalnızca inceleyebilenlere (head admin, topluluk rolü) gösterilir.
const ASKIDA = "Bu etkinlik platform tarafından geçici olarak durduruldu.";
const REASON = "Örnek askı gerekçesi: kural ihlali incelemesi.";
const htmlOf = async (path, init) => (await fetch(`http://127.0.0.1:3100${path}`, init)).text();
await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
assert.ok(!(await htmlOf("/")).includes(ASKIDA), "Askıda olmayan etkinlikte askı uyarısı görünüyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&askida=1");
const publicHome = await htmlOf("/");
assert.ok(publicHome.includes(ASKIDA), "Askıdaki etkinlikte ana sayfada uyarı yok.");
assert.ok(!publicHome.includes("Gerekçe:") && !publicHome.includes(REASON), "Ziyaretçi askı gerekçesini görüyor.");
const managerHome = await htmlOf("/", auth);
assert.ok(managerHome.includes(ASKIDA) && managerHome.includes("Gerekçe:") && managerHome.includes(REASON), "İnceleyebilen askı gerekçesini görmüyor.");
const suspendedPanel = await htmlOf("/panel", auth);
assert.ok(suspendedPanel.includes(ASKIDA), "Askıdaki etkinlikte panelde uyarı yok.");
assert.ok(/<button[^>]*disabled=""[^>]*>Teslim sürümünü güncelle/.test(suspendedPanel), "Askıdayken teslim düğmesi etkin.");
assert.ok(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Değişiklikleri kaydet/.test(suspendedPanel), "Askıdayken proje kaydetme düğmesi etkin.");
console.log("PASS: Askı uyarısı herkese, gerekçe yalnızca inceleyenlere; panelde gönderim düğmeleri pasif.");
// Head admin: yönetim sayfasının üstünde Platform bölümü; askıdaysa kaldırma, değilse askıya alma düğmesi.
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&rol=head-admin&askida=1");
const platformSuspended = await htmlOf("/yonetim", auth);
assert.ok(platformSuspended.includes("Platform") && platformSuspended.includes("Askıyı kaldır") && platformSuspended.includes(REASON), "Head admin askıyı kaldıramıyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&rol=head-admin");
const platformOpen = await htmlOf("/yonetim", auth);
assert.ok(platformOpen.includes("Platform") && platformOpen.includes("Askıya al") && platformOpen.includes('name="gerekce"'), "Head admin askıya alma formunu görmüyor.");
console.log("PASS: Head admin yönetimde Platform bölümünden askıya alır / askıyı kaldırır.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed");
// Telegram duyurusunun görseli: herkese açık kazanan kartı PNG; bilinmeyen kazanan 404.
const card = await fetch("http://127.0.0.1:3100/api/kazanan/a1");
assert.equal(card.status, 200);
assert.equal(card.headers.get("content-type"), "image/png");
assert.deepEqual([...new Uint8Array(await card.arrayBuffer()).slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
assert.equal((await fetch("http://127.0.0.1:3100/api/kazanan/yok")).status, 404);
console.log("PASS: Kazanan kartı PNG olarak üretiliyor; bilinmeyen kazanan 404.");
