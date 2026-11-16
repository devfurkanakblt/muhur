// Plan 5 · arşiv okuyucularında 30 günlük saklama. `npm run preview:test` açıkken çalışır (sahte Supabase; canlı depo yok).
import assert from "node:assert/strict";

const base = "http://127.0.0.1:3100";
const fixture = (query) => fetch(`http://127.0.0.1:54330/fixture/state?${query}`);
const session = await (await fetch("http://127.0.0.1:54330/fixture/session")).json();
const auth = { headers: { Cookie: `${session.name}=${session.value}` }, redirect: "manual" };
const project = "30000000-0000-0000-0000-000000000001";
const lastSign = async () => (await (await fetch("http://127.0.0.1:54330/fixture/last-sign")).json()).seconds;

try {
  // Önce kimlik/kapsam, sonra saklama: yetkisiz kullanıcı süresi dolmuş arşivin varlığını 410'dan öğrenemez.
  await fixture("mode=sealed&saklama=doldu");
  assert.equal((await fetch(`${base}/api/arsiv/${project}`, { redirect: "manual" })).status, 403, "Anonim 410 görüyor.");
  await fixture("mode=sealed&saklama=doldu&rol=yabanci");
  // Fikstür kullanıcısı 1 numaralı eserin ekibinde; başka ekibin (2 numara) arşivi denenir.
assert.equal((await fetch(`${base}/api/arsiv/30000000-0000-0000-0000-000000000002`, auth)).status, 403, "Başka topluluğun organizatörü 410 görüyor.");
  await fixture("mode=sealed&saklama=doldu");
  const expired = await fetch(`${base}/api/arsiv/${project}`, auth);
  assert.equal(expired.status, 410);
  assert.equal((await expired.json()).error, "Arşivin 30 günlük saklama süresi doldu.");
  assert.equal(await lastSign(), null, "Süre dolduktan sonra imzalı URL üretildi.");
  assert.equal((await fetch(`${base}/api/arsiv/${project}?surum=kabul`, auth)).status, 410, "Kabul sürümü süre sonunda verildi.");
  assert.equal((await fetch(`${base}/api/arsiv/00000000-0000-0000-0000-00000000dead`, auth)).status, 404, "Sahte kimlik 404 değil.");
  console.log("PASS: Süresi dolan arşiv yetkiliye 410, yetkisize 403; imzalı URL üretilmez; sahte kimlik 404.");

  // İmzalı URL ömrü kalan saklama süresini aşmaz; çok az kaldıysa yeni URL yok.
  await fixture("mode=sealed");
  assert.equal((await fetch(`${base}/api/arsiv/${project}`, auth)).status, 307);
  assert.equal(await lastSign(), 60);
  await fixture("mode=sealed&saklama=az");
  assert.equal((await fetch(`${base}/api/arsiv/${project}`, auth)).status, 307);
  assert.equal(await lastSign(), 30, "İmzalı URL kalan 30 saniyeyi aştı.");
  await fixture("mode=sealed&saklama=bitti");
  assert.equal((await fetch(`${base}/api/arsiv/${project}`, auth)).status, 410, "Eşiğe saniyeler kala yeni URL verildi.");
  console.log("PASS: İmzalı URL ömrü min(60 sn, kalan saklama); eşiğe yakın yeni URL yok.");

  // Jüri: ZIP 410; CSV kanıtı indirilebilir ve saklama alanlarını taşır.
  await fixture("mode=sealed&saklama=doldu");
  for (const paket of ["gecerli", "eksiksiz"]) {
    const zip = await fetch(`${base}/api/juri/ornek-etkinlik?paket=${paket}`, auth);
    assert.equal(zip.status, 410, `paket=${paket} süre sonunda verildi`);
    assert.match((await zip.json()).error, /saklama süresi doldu/);
  }
  const csv = await fetch(`${base}/api/juri/ornek-etkinlik?format=csv`, auth);
  assert.equal(csv.status, 200);
  const text = await csv.text();
  assert.ok(text.includes("archive_status") && text.includes("deleted_at") && text.includes("archive_expires_at"), "CSV saklama sütunları yok.");
  assert.ok(text.includes("deleted") && text.includes("b".repeat(64)), "CSV silinen dosyanın kanıtını (SHA-256) göstermiyor.");
  console.log("PASS: Jüri ZIP süre sonunda 410; CSV kanıtı archive_status/deleted_at/vade ile indirilebilir.");

  // Ekranlar: bağlantı yerine saklama metni; mühür kaydı kalır.
  const panel = await (await fetch(`${base}/e/ornek-etkinlik/panel`, auth)).text();
  assert.ok(panel.includes("30 günlük saklama süresi doldu") && !panel.includes(`href="/api/arsiv/${project}"`), "Panel süre sonunda indirme bağlantısı gösteriyor.");
  assert.ok(panel.includes("b".repeat(64)), "Panel mühür SHA-256 kaydını göstermiyor.");
  const receipt = await (await fetch(`${base}/sergi/ornek-etkinlik/1/makbuz`, auth)).text();
  assert.ok(receipt.includes("Arşiv dosyası") && receipt.includes("saklama süresi doldu"), "Makbuz saklama durumunu göstermiyor.");
  const jury = await (await fetch(`${base}/e/ornek-etkinlik/juri`, auth)).text();
  assert.ok(!jury.includes("Mühürlü teslimleri ZIP indir") && jury.includes("Teslim listesi CSV"), "Jüri alanı süre sonunda ZIP bağlantısı gösteriyor.");
  await fixture("mode=sealed");
  const panelOpen = await (await fetch(`${base}/e/ornek-etkinlik/panel`, auth)).text();
  assert.ok(panelOpen.includes(`href="/api/arsiv/${project}"`) && panelOpen.includes("tarihine kadar indirilebilir"), "Süre dolmadan bağlantı/vade metni yok.");
  console.log("PASS: Panel, makbuz ve jüri alanı süre sonunda bağlantı yerine saklama metni ve geçerli mühür kaydı gösterir.");
} finally {
  await fixture("mode=open");
}
