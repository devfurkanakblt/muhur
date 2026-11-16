import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { communityLogoPath, isCommunityLogoPath, normalizeCommunityLogo, saveCommunityBranding } from "../lib/brand-logo.ts";
import { logoKeepSet, orphanLogo } from "../lib/storage-keep.ts";

const C1 = "19000000-0000-0000-0000-000000000101";
const C2 = "19000000-0000-0000-0000-000000000102";
const png = (w, h, opts = {}) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 74, g: 54, b: 207, alpha: 1 } } }).png().withMetadata(opts).toBuffer().then((b) => new Uint8Array(b));

test("topluluk logosu çözülür, metadatası atılır ve WEBP olarak yeniden kodlanır", async () => {
  const input = await sharp(await png(600, 600)).jpeg().withExif({ IFD0: { Copyright: "gizli-not", Artist: "kisi" } }).toBuffer();
  assert.ok((await sharp(input).metadata()).exif, "girdi EXIF taşımalı");
  const out = await normalizeCommunityLogo(new Uint8Array(input), "image/jpeg");
  assert.equal(typeof out, "object");
  const meta = await sharp(out.bytes).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.exif, undefined);
  assert.equal(meta.icc, undefined);
  assert.deepEqual([out.width, out.height], [600, 600]);
  assert.ok(!new TextDecoder("latin1").decode(out.bytes).includes("gizli-not"));
});

test("SVG, HTML taklidi, sahte başlık, tür uyuşmazlığı ve aşırı boyut reddedilir", async () => {
  assert.match(await normalizeCommunityLogo(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml"), /PNG, JPG ya da WEBP/);
  const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  assert.match(await normalizeCommunityLogo(html, "image/png"), /açılamadı|uyuşmuyor/);
  const fake = new Uint8Array(24);
  fake.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 2, 0, 0, 0, 2, 0]);
  assert.match(await normalizeCommunityLogo(fake, "image/png"), /açılamadı/);
  assert.match(await normalizeCommunityLogo(await png(600, 600), "image/webp"), /uyuşmuyor/);
  assert.match(await normalizeCommunityLogo(await png(600, 300), "image/png"), /kare/);
  assert.match(await normalizeCommunityLogo(await png(3000, 3000), "image/png"), /1 MB|en fazla 2048/);
});

test("hareketli görsel reddedilir", async () => {
  const frame = await png(600, 600);
  // Kareler farklı olmalı: aynı kareler kodlayıcıda tek kareye indirgenir.
  const other = await sharp({ create: { width: 600, height: 600, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  let animated;
  try {
    animated = await sharp([frame, other], { join: { animated: true } }).webp().toBuffer();
  } catch {
    return; // Bu sharp sürümü hareketli birleştirme desteklemiyorsa test atlanır.
  }
  assert.match(await normalizeCommunityLogo(new Uint8Array(animated), "image/webp"), /Hareketli/);
});

test("logo yolu sunucuda üretilir ve topluluğun önekine bağlıdır", () => {
  const path = communityLogoPath(C1);
  assert.match(path, /^topluluk\/19000000-0000-0000-0000-000000000101\/[a-f0-9]{24}\.webp$/);
  assert.notEqual(communityLogoPath(C1), communityLogoPath(C1));
  assert.throws(() => communityLogoPath("../x"));
  assert.throws(() => communityLogoPath(C1, "../../etc"));
  assert.equal(isCommunityLogoPath(path, C1), true);
  assert.equal(isCommunityLogoPath(path, C2), false);
  assert.equal(isCommunityLogoPath("abc/def.png"), false);
});

function fakeStorage() {
  const files = new Set();
  return {
    files,
    upload: async (path) => { files.add(path); },
    remove: async (path) => { files.delete(path); },
  };
}

test("DB yazması başarısızsa yeni dosya telafiyle silinir; eski logo yerinde kalır", async () => {
  const storage = fakeStorage();
  storage.files.add("topluluk/" + C1 + "/" + "a".repeat(24) + ".webp");
  const logo = { bytes: new Uint8Array([1]), width: 512, height: 512 };
  await assert.rejects(saveCommunityBranding(C1, {}, logo, { ...storage, save: async () => { throw new Error("YETKI: x"); } }), /YETKI/);
  assert.deepEqual([...storage.files], ["topluluk/" + C1 + "/" + "a".repeat(24) + ".webp"]);
});

test("yükleme başarısızsa DB'ye yazılmaz", async () => {
  let saved = false;
  await assert.rejects(saveCommunityBranding(C1, {}, { bytes: new Uint8Array([1]), width: 512, height: 512 }, {
    upload: async () => { throw new Error("depo"); }, remove: async () => {}, save: async () => { saved = true; return { previousLogo: null }; },
  }));
  assert.equal(saved, false);
});

test("eski logo yalnız DB referanssız bildirdiyse ve aynı topluluğun yoluysa silinir", async () => {
  const storage = fakeStorage();
  const old = "topluluk/" + C1 + "/" + "b".repeat(24) + ".webp";
  const foreign = "topluluk/" + C2 + "/" + "c".repeat(24) + ".webp";
  storage.files.add(old); storage.files.add(foreign);
  const logo = { bytes: new Uint8Array([1]), width: 512, height: 512 };
  // Mühürlü görünümde kullanılan logo: DB previous_logo döndürmez → silinmez.
  await saveCommunityBranding(C1, {}, logo, { ...storage, save: async () => ({ previousLogo: null }) });
  assert.ok(storage.files.has(old));
  // Başka topluluğun yolu dönse bile silinmez.
  await saveCommunityBranding(C1, {}, logo, { ...storage, save: async () => ({ previousLogo: foreign }) });
  assert.ok(storage.files.has(foreign));
  const { logoPath } = await saveCommunityBranding(C1, {}, logo, { ...storage, save: async () => ({ previousLogo: old }) });
  assert.ok(!storage.files.has(old));
  assert.ok(storage.files.has(logoPath));
});

test("iki eşzamanlı logo değişikliğinde son yazılan logo depoda kalır; kaybeden dosya temizlenir", async () => {
  const storage = fakeStorage();
  let current = null;
  let chain = Promise.resolve();
  // DB satır kilidi gibi sıralı: her yazma bir öncekinin logosunu "eski" olarak döndürür.
  const save = (changes) => (chain = chain.then(async () => {
    await new Promise((r) => setTimeout(r, 5));
    const previousLogo = current; current = changes.logo_path; return { previousLogo };
  }));
  const logo = { bytes: new Uint8Array([1]), width: 512, height: 512 };
  await Promise.all([saveCommunityBranding(C1, {}, logo, { ...storage, save }), saveCommunityBranding(C1, {}, logo, { ...storage, save })]);
  assert.deepEqual([...storage.files], [current]);
});

test("depo temizliği: topluluk logosu ve mühürlü görünüm logosu korunur, sahipsiz ve eski dosya silinir", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  const old = { name: "x", id: "1", created_at: "2026-11-10T00:00:00Z" };
  const young = { name: "x", id: "1", created_at: "2026-11-16T11:00:00Z" };
  const folder = { name: "x", id: null, created_at: null };
  const live = "topluluk/" + C1 + "/" + "a".repeat(24) + ".webp";
  const sealed = "topluluk/" + C1 + "/" + "b".repeat(24) + ".webp";
  const orphan = "topluluk/" + C1 + "/" + "c".repeat(24) + ".webp";
  const keep = logoKeepSet([{ logo_path: "p1/logo.png" }], [{ logo_path: live }], [{ community_logo_path: sealed }]);
  const day = 24 * 3600_000;
  assert.equal(orphanLogo(live, old, keep, now, day), false);
  assert.equal(orphanLogo(sealed, old, keep, now, day), false);
  assert.equal(orphanLogo("p1/logo.png", old, keep, now, day), false);
  assert.equal(orphanLogo(orphan, young, keep, now, day), false);
  assert.equal(orphanLogo(orphan, folder, keep, now, day), false);
  assert.equal(orphanLogo(orphan, old, keep, now, day), true);
});
