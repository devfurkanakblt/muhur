import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const session = await (await fetch("http://127.0.0.1:54330/fixture/session")).json();
const htmlOf = async (path, init) => (await fetch(`http://127.0.0.1:3100${path}`, init)).text();
mkdirSync("test-artifacts", { recursive: true });
const cases = [
  { path: "/e/ornek-etkinlik/panel", mode: "open", name: "panel-open", expected: ["Teslim sürümü kabul edildi", "Teslim sürümünü güncelle", "geri alınamaz", "Kuruculuğu devret"] },
  { path: "/e/ornek-etkinlik", mode: "open", name: "gallery", expected: ["Proje veya ekip ara", "Sıralama", "gallery-search"] },
  { path: "/e/ornek-etkinlik/panel", mode: "sealed", name: "panel-sealed", expected: ["Arşiv doğrulandı", "Mühür makbuzu"] },
  { path: "/e/ornek-etkinlik/yonetim", mode: "sealed", name: "admin", expected: ["Jüri paketi", "Jüri ödülleri", "Kuyruğu şimdi işle"] },
  { path: "/yonetim", mode: "sealed", name: "platform-admin", expected: ["Son başarılı çalışma", "Kişisel veri silme"] },
  { path: "/e/ornek-etkinlik/sahne", mode: "sealed", name: "stage", expected: ["Vitrini açan karekod", "Vitrini aç", "Sahneye dön"] },
  { path: "/e/ornek-etkinlik", mode: "sealed", name: "winners", expected: ["id=\"kazananlar\"", "Kazananları gör", "Örnek · En iyi teknik çözüm"] },
  { path: "/e/ornek-etkinlik/panel", mode: "failed", name: "panel-failed", expected: ["Teslimde sorun var", "Arşiv deposuna ulaşılamadı"] },
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
// Etkinlik adresleri: bilinmeyen slug her yüzeyde ve durum ucunda 404 (500 değil).
await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
for (const path of ["/e/yok", "/e/yok/panel", "/e/yok/sahne", "/e/yok/belge", "/e/yok/maskot", "/e/yok/yonetim"]) {
  assert.equal((await fetch(`http://127.0.0.1:3100${path}`)).status, 404, `${path} 404 dönmüyor.`);
}
for (const path of ["/api/durum?e=yok", "/api/durum", "/api/sahne?e=yok", "/api/maskot/durum?e=yok"]) {
  const missing = await fetch(`http://127.0.0.1:3100${path}`);
  assert.equal(missing.status, 404, `${path} 404 dönmüyor.`);
  assert.deepEqual(await missing.json(), { error: "Etkinlik bulunamadı." });
}
const durum = await fetch("http://127.0.0.1:3100/api/durum?e=ornek-etkinlik");
assert.equal(durum.status, 200);
assert.equal(typeof (await durum.json()).version, "string", "Durum yanıtında version yok.");
assert.equal((await fetch("http://127.0.0.1:3100/api/sahne?e=ornek-etkinlik")).status, 200);
assert.equal((await fetch("http://127.0.0.1:3100/api/maskot/durum?e=ornek-etkinlik")).status, 200);
const vitrin = await (await fetch("http://127.0.0.1:3100/e/ornek-etkinlik")).text();
assert.ok(vitrin.includes("DEÜ CS&amp;AI") && vitrin.includes("Örnek Hackathon · Yerel Test"), "Etkinlik vitrini topluluk adını ve etkinlik adını göstermiyor.");
assert.ok(vitrin.includes('href="/e/ornek-etkinlik/belge"') && vitrin.includes('href="/e/ornek-etkinlik/maskot"'), "Başlık gezinmesi etkinliğe göre kurulmamış.");
assert.ok(vitrin.includes('id="mystery-title"'), "Gizem penceresi etkinlik vitrininde yok.");
for (const path of ["/e/ornek-etkinlik/belge", "/e/ornek-etkinlik/maskot"]) assert.equal((await fetch(`http://127.0.0.1:3100${path}`)).status, 200, `${path} açılmıyor.`);
console.log("PASS: Etkinlik adresleri /e/<slug>; bilinmeyen slug 404; durum uçları slug'a göre.");
// Platform ana sayfası: listelenen etkinlikler; askıdaki etkinlik listede yok.
const home = await htmlOf("/");
for (const text of ["Süre dolar, mühür vurulur.", "Hackathon teslimlerini sunucuda mühürleyen platform.", "Aktif etkinlikler", "Geçmiş etkinlikler · sergiler", "Örnek Hackathon · Yerel Test", 'href="/e/ornek-etkinlik"']) {
  assert.ok(home.includes(text), `Ana sayfada '${text}' yok.`);
}
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&askida=1");
const homeSuspended = await htmlOf("/");
assert.ok(!homeSuspended.includes("Örnek Hackathon · Yerel Test"), "Askıdaki etkinlik ana sayfada listeleniyor.");
assert.ok(homeSuspended.includes("Şu an aktif etkinlik yok.") && !homeSuspended.includes("Örnek askı gerekçesi"), "Askıdaki etkinlik boş durumu göstermiyor ya da gerekçe sızıyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed");
const homeSealed = await htmlOf("/");
assert.ok(homeSealed.includes('href="/sergi/ornek-etkinlik"') && homeSealed.includes("Şu an aktif etkinlik yok."), "Mühürlü etkinlik geçmiş sergiler listesinde değil.");
console.log("PASS: Ana sayfa listelenen etkinlikleri gösterir; askıdaki etkinlik listede yok.");
// Eski adresler: 307 ile en uygun etkinliğe, sorgu dizesi korunarak.
await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
const legacy = async (path, init = {}) => {
  const response = await fetch(`http://127.0.0.1:3100${path}`, { ...init, redirect: "manual" });
  const location = response.headers.get("location");
  return { status: response.status, to: location && (({ pathname, search }) => pathname + search)(new URL(location, "http://127.0.0.1:3100")) };
};
for (const surface of ["panel", "sahne", "belge", "maskot"]) {
  assert.deepEqual(await legacy(`/${surface}`), { status: 307, to: `/e/ornek-etkinlik/${surface}` }, `/${surface} yönlendirmesi yanlış.`);
}
assert.deepEqual(await legacy("/panel?hata=giris&x=1"), { status: 307, to: "/e/ornek-etkinlik/panel?hata=giris&x=1" }, "Sorgu dizesi korunmuyor.");
assert.deepEqual(await legacy("/panel", { headers: { Cookie: `${session.name}=${session.value}` } }), { status: 307, to: "/e/ornek-etkinlik/panel" }, "Girişli /panel ekibin etkinliğine gitmiyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&askida=1");
assert.deepEqual(await legacy("/sahne"), { status: 307, to: "/" }, "Listelenecek etkinlik yokken /sahne ana sayfaya dönmüyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
assert.equal((await fetch("http://127.0.0.1:3100/davet/preview-invite")).status, 200, "Davet bağlantısı açılmıyor.");
assert.equal((await fetch("http://127.0.0.1:3100/davet/yok")).status, 404, "Geçersiz davet 404 dönmüyor.");
assert.equal((await fetch("http://127.0.0.1:3100/sergi/ornek-etkinlik/1")).status, 200, "Eser sayfası açılmıyor.");
assert.deepEqual(await legacy("/sergi/ornek-etkinlik"), { status: 307, to: "/e/ornek-etkinlik" }, "Açık etkinliğin sergisi vitrine yönlenmiyor.");
console.log("PASS: /panel, /sahne, /belge, /maskot 307 ile yönlenir; davet ve eser sayfası açılır.");
// Yönetim merkezi: anonim ve yabancı 404; yönetici etkinliğin yönetimine giden bağlantıyı ve yeni etkinlik formunu görür.
const hubAuth = { headers: { Cookie: `${session.name}=${session.value}` } };
assert.equal((await fetch("http://127.0.0.1:3100/yonetim")).status, 404, "Anonim yönetim merkezini görüyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&rol=yabanci");
assert.equal((await fetch("http://127.0.0.1:3100/yonetim", hubAuth)).status, 404, "Yabancı yönetim merkezini görüyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
const hub = await fetch("http://127.0.0.1:3100/yonetim", hubAuth);
assert.equal(hub.status, 200, "Yönetici yönetim merkezini açamıyor.");
const hubHtml = await hub.text();
assert.ok(hubHtml.includes('href="/e/ornek-etkinlik/yonetim"') && hubHtml.includes("Yeni etkinlik") && hubHtml.includes('name="community"'), "Yönetim merkezinde etkinlik bağlantısı ya da yeni etkinlik formu yok.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&rol=sahip");
const ownerHub = await htmlOf("/yonetim", hubAuth);
assert.ok(ownerHub.includes('href="/e/ornek-etkinlik/yonetim"') && !ownerHub.includes("Kişisel veri silme"), "Topluluk sahibi merkezde etkinliğini görmüyor ya da head admin bölümlerini görüyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&rol=komsu");
const neighbour = await fetch("http://127.0.0.1:3100/yonetim", hubAuth);
assert.equal(neighbour.status, 200, "Onaylı başka topluluğun organizatörü kendi merkezini açamıyor.");
const neighbourHtml = await neighbour.text();
assert.ok(!neighbourHtml.includes("/e/ornek-etkinlik/yonetim") && neighbourHtml.includes("Başka Topluluk"), "Başka topluluğun organizatörü bu etkinliği merkezde görüyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&rol=head-admin&askida=1");
const headHub = await htmlOf("/yonetim", hubAuth);
assert.ok(headHub.includes('href="/e/ornek-etkinlik/yonetim"') && headHub.includes("Askıda") && !headHub.includes('name="community"'), "Head admin askıdaki etkinliği merkezde görmüyor ya da topluluksuz form görüyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
console.log("PASS: Yönetim merkezi yalnızca yetkili etkinlikleri listeler; anonim ve yabancı 404.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed");
const anonymous = await fetch("http://127.0.0.1:3100/e/ornek-etkinlik/yonetim");
assert.equal(anonymous.status, 404, "Anonim ziyaretçi yönetim sayfasını görebiliyor.");
assert.equal((await fetch("http://127.0.0.1:3100/yonetim")).status, 404, "Anonim ziyaretçi platform yönetimini görebiliyor.");
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
assert.equal((await fetch("http://127.0.0.1:3100/e/ornek-etkinlik/yonetim", auth)).status, 404, "Başka topluluğun organizatörü yönetim sayfasını açabiliyor.");
assert.equal((await fetch("http://127.0.0.1:3100/api/juri/ornek-etkinlik?format=csv", auth)).status, 403, "Başka topluluğun organizatörü jüri paketini indirebiliyor.");
assert.equal((await fetch("http://127.0.0.1:3100/api/arsiv/30000000-0000-0000-0000-000000000002", auth)).status, 403, "Başka topluluğun organizatörü başka ekibin arşivine erişebiliyor.");
assert.notEqual((await fetch("http://127.0.0.1:3100/api/arsiv/30000000-0000-0000-0000-000000000001", auth)).status, 403, "Ekip üyesi kendi arşivine erişemiyor.");
assert.ok(!(await (await fetch("http://127.0.0.1:3100/e/ornek-etkinlik", auth)).text()).includes('href="/e/ornek-etkinlik/yonetim"'), "Yetkisiz kullanıcıya Yönetim bağlantısı görünüyor.");
console.log("PASS: Başka topluluğun organizatörü yönetim, jüri paketi ve başka ekibin arşivine erişemiyor.");
// Yalnızca head admin: inceler ama yönetemez (salt okunur; kilit, ödül, duyuru formları yok).
await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed&rol=head-admin");
const readOnly = await fetch("http://127.0.0.1:3100/e/ornek-etkinlik/yonetim", auth);
assert.equal(readOnly.status, 200);
const readOnlyHtml = await readOnly.text();
assert.ok(readOnlyHtml.includes("Salt okunur: bu etkinliği yönetme yetkin yok ya da etkinlik askıda."), "Head admin için salt okunur satırı yok.");
for (const hidden of ["Ödülü kaldır", "name=\"announcement\"", "name=\"slug\""]) assert.ok(!readOnlyHtml.includes(hidden), `Head admin yönetim formu görüyor: ${hidden}`);
assert.ok(readOnlyHtml.includes("Jüri paketi"), "Head admin inceleme bölümlerini görmüyor.");
const platformHtml = await htmlOf("/yonetim", auth);
assert.ok(platformHtml.includes("Kişisel veri silme") && platformHtml.includes("Son başarılı çalışma"), "Head admin platform yönetiminde anonimleştirme ve zamanlayıcı kayıtlarını görmüyor.");
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
const ownerPage = await fetch("http://127.0.0.1:3100/e/ornek-etkinlik/yonetim", auth);
assert.equal(ownerPage.status, 200);
const ownerHtml = await ownerPage.text();
assert.ok(ownerHtml.includes("Kuyruğu şimdi işle") && ownerHtml.includes("Jüri ödülleri"), "Topluluk sahibi yönetim bölümlerini görmüyor.");
const ownerPlatform = await htmlOf("/yonetim", auth);
for (const hidden of ["Son başarılı çalışma", "Henüz başarılı zamanlayıcı çalışması yok"]) {
  assert.ok(!ownerHtml.includes(hidden) && !ownerPlatform.includes(hidden), `Topluluk sahibi zamanlayıcı kayıtlarını görüyor: ${hidden}`);
}
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
await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
assert.ok(!(await htmlOf("/e/ornek-etkinlik")).includes(ASKIDA), "Askıda olmayan etkinlikte askı uyarısı görünüyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&askida=1");
const publicHome = await htmlOf("/e/ornek-etkinlik");
assert.ok(publicHome.includes(ASKIDA), "Askıdaki etkinlikte ana sayfada uyarı yok.");
assert.ok(!publicHome.includes("Gerekçe:") && !publicHome.includes(REASON), "Ziyaretçi askı gerekçesini görüyor.");
const managerHome = await htmlOf("/e/ornek-etkinlik", auth);
assert.ok(managerHome.includes(ASKIDA) && managerHome.includes("Gerekçe:") && managerHome.includes(REASON), "İnceleyebilen askı gerekçesini görmüyor.");
const suspendedPanel = await htmlOf("/e/ornek-etkinlik/panel", auth);
assert.ok(suspendedPanel.includes(ASKIDA), "Askıdaki etkinlikte panelde uyarı yok.");
assert.ok(/<button[^>]*disabled=""[^>]*>Teslim sürümünü güncelle/.test(suspendedPanel), "Askıdayken teslim düğmesi etkin.");
assert.ok(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Değişiklikleri kaydet/.test(suspendedPanel), "Askıdayken proje kaydetme düğmesi etkin.");
console.log("PASS: Askı uyarısı herkese, gerekçe yalnızca inceleyenlere; panelde gönderim düğmeleri pasif.");
// Head admin: yönetim sayfasının üstünde Platform bölümü; askıdaysa kaldırma, değilse askıya alma düğmesi.
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&rol=head-admin&askida=1");
const platformSuspended = await htmlOf("/e/ornek-etkinlik/yonetim", auth);
assert.ok(platformSuspended.includes("Platform") && platformSuspended.includes("Askıyı kaldır") && platformSuspended.includes(REASON), "Head admin askıyı kaldıramıyor.");
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&rol=head-admin");
const platformOpen = await htmlOf("/e/ornek-etkinlik/yonetim", auth);
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

// Aynı anda açık iki etkinlik: panel ve davet her zaman kendi etkinliğinin projesini okur.
await fetch("http://127.0.0.1:54330/fixture/state?mode=open&coklu=1&rol=sahip");
const multiHome = await htmlOf("/");
assert.ok(multiHome.includes('href="/e/ornek-etkinlik"') && multiHome.includes('href="/e/ikinci-etkinlik"'));
for (const [slug, ownName, otherName] of [
  ["ornek-etkinlik", "Örnek · Akıllı Kampüs", "İkinci Etkinlik Projesi"],
  ["ikinci-etkinlik", "İkinci Etkinlik Projesi", "Örnek · Akıllı Kampüs"],
]) {
  const panel = await htmlOf(`/e/${slug}/panel`, hubAuth);
  assert.ok(panel.includes(ownName) && !panel.includes(otherName), `${slug}: panel başka etkinliğin projesini gösteriyor.`);
}
const secondInvite = await htmlOf("/davet/second-invite");
assert.ok(secondInvite.includes("İkinci Ekip") && secondInvite.includes("seni ekibe çağırıyor."));
assert.equal((await fetch("http://127.0.0.1:3100/e/ikinci-etkinlik/yonetim", hubAuth)).status, 404);
assert.equal((await fetch("http://127.0.0.1:3100/e/ikinci-etkinlik/maskot", hubAuth)).status, 404);
assert.equal((await fetch("http://127.0.0.1:3100/api/maskot/durum?e=ikinci-etkinlik")).status, 404);
await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
console.log("PASS: İki açık etkinliğin panelleri ve davetleri ayrıdır; başka topluluğun yönetimi ve maskotu kapalıdır.");
