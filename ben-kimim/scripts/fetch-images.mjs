// Kart fotoğraflarını Wikimedia Commons'tan indirir, WebP'ye çevirir ve künyelerini yazar.
// Kullanım: npm run images   (yalnızca eksik kartları indirir; --force hepsini yeniler)
// Yalnızca Commons'ta duran ve serbest lisanslı (CC0, kamu malı, CC BY, CC BY-SA) dosyalar kabul edilir.
import { mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import sharp from "sharp";
import { DECK } from "../lib/deck.ts";

const OUT = new URL("../public/kartlar/", import.meta.url);
const CREDITS = new URL("../lib/credits.json", import.meta.url);
const UA = "DEU-CSAI-ben-kimim/1.0 (hackathon oyunu; https://github.com/devfurkanakblt)";
const FREE = /^(cc0|public domain|pd\b|cc by(-sa)? \d)/i;
const force = process.argv.includes("--force");

async function json(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const strip = (html = "") => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

async function pageImage(title) {
  const q = `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=name&titles=${encodeURIComponent(title)}`;
  const page = Object.values((await json(q)).query.pages)[0];
  if (!page.pageimage) throw new Error(`${title}: maddede görsel yok`);
  return page.pageimage;
}

async function commonsInfo(file) {
  const q = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1000&titles=${encodeURIComponent(`File:${file}`)}`;
  const page = Object.values((await json(q)).query.pages)[0];
  const info = page.imageinfo?.[0];
  if (!info) throw new Error(`${file}: Commons'ta yok (yerel, büyük olasılıkla serbest olmayan dosya)`);
  const meta = info.extmetadata ?? {};
  const license = strip(meta.LicenseShortName?.value);
  if (!FREE.test(license)) throw new Error(`${file}: lisans serbest değil (${license || "bilinmiyor"})`);
  return {
    url: info.thumburl ?? info.url,
    author: strip(meta.Artist?.value) || "Bilinmiyor",
    license,
    source: info.descriptionurl,
  };
}

const exists = (url) => access(url).then(() => true, () => false);

await mkdir(OUT, { recursive: true });
const credits = (await exists(CREDITS)) ? JSON.parse(await readFile(CREDITS, "utf8")) : {};
const failed = [];

for (const entry of DECK) {
  const target = new URL(`${entry.id}.webp`, OUT);
  if (!force && credits[entry.id]?.file === (entry.file ?? credits[entry.id]?.file) && (await exists(target))) continue;
  try {
    const file = entry.file ?? (await pageImage(entry.wiki));
    const info = await commonsInfo(file);
    const res = await fetch(info.url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status} ${info.url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf).rotate().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toFile(target.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    credits[entry.id] = { file, author: info.author, license: info.license, source: info.source };
    console.log(`✓ ${entry.name} — ${info.license} — ${info.author}`);
  } catch (err) {
    failed.push(entry.id);
    console.error(`✗ ${entry.name}: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 250));
}

// Desteden çıkarılan kartların fotoğrafı ve künyesi bırakılmaz.
const ids = new Set(DECK.map((e) => e.id));
for (const id of Object.keys(credits)) {
  if (ids.has(id)) continue;
  delete credits[id];
  await rm(new URL(`${id}.webp`, OUT), { force: true });
}

await writeFile(CREDITS, JSON.stringify(credits, null, 2) + "\n");
console.log(`\n${Object.keys(credits).length}/${DECK.length} kart hazır.${failed.length ? ` Eksik: ${failed.join(", ")}` : ""}`);
if (failed.length) process.exitCode = 1;
