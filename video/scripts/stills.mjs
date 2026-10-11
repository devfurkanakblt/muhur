// Kontrol kareleri: her sahneden seçili anları PNG olarak çıkarır (stills/ klasörüne).
// Kullanım: node scripts/stills.mjs [S01,S05,...] [--scale 0.5]
import { bundle } from "@remotion/bundler";
import { getCompositions, renderStill } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith("--"))?.split(",");
const si = args.indexOf("--scale");
const scale = si >= 0 ? Number(args[si + 1]) : 0.5;

// Sahne başına incelenecek kareler.
const PICKS = {
  S01: [60, 150, 230, 288],
  S02: [40, 120],
  S03: [80, 130, 230, 420],
  S04: [140, 240],
  S05: [150, 300],
  S06: [206, 300],
  S07: [250, 360],
  S08: [100, 230],
  S09: [150],
  S10: [60, 180],
  S11: [70, 200],
  S12: [100, 180],
  S13: [95, 200],
  S14: [140, 260],
  S15: [150],
  S16: [100, 220, 280, 420],
  S17: [150],
  S18: [110, 200, 389],
  S19: [150],
  S20: [200, 300, 400],
  S21: [120, 300],
  S22: [100],
};

const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public") });
const comps = await getCompositions(serveUrl);
const out = path.join(root, "stills");
mkdirSync(out, { recursive: true });
for (const c of comps) {
  if (!PICKS[c.id] || (only && !only.includes(c.id))) continue;
  for (const f of PICKS[c.id]) {
    const file = path.join(out, `${c.id}-${String(f).padStart(3, "0")}.png`);
    await renderStill({ composition: c, serveUrl, output: file, frame: Math.min(f, c.durationInFrames - 1), scale, imageFormat: "png" });
    console.log(path.basename(file));
  }
}
