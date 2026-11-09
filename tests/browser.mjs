import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openBrowser } from "./browser-driver.mjs";

const cases = [
  { path: "/e/ornek-etkinlik/panel", mode: "open", width: 1366, height: 900, name: "panel-desktop", expect: ["Teslim sürümü kabul edildi", "Teslim sürümünü güncelle"] },
  { path: "/e/ornek-etkinlik/panel", mode: "sealed", width: 1366, height: 900, name: "panel-sealed", expect: ["Arşiv doğrulandı", "Mühür makbuzu"] },
  { path: "/e/ornek-etkinlik/yonetim", mode: "sealed", width: 1366, height: 900, name: "admin-desktop", expect: ["Jüri paketi", "Jüri ödülleri", "Diğer sütunları görmek"] },
  { path: "/e/ornek-etkinlik/sahne", mode: "sealed", width: 1366, height: 900, name: "stage-desktop", expect: ["Tara", "Vitrini aç", "Sahneye dön", "preview-member"] },
  { path: "/e/ornek-etkinlik", mode: "sealed", width: 1366, height: 900, name: "winners-desktop", expect: ["Kazananları gör", "Kazananlar", "Örnek · En iyi teknik çözüm", "Eseri gör"] },
  { path: "/e/ornek-etkinlik", mode: "sealed", width: 390, height: 844, name: "winners-mobile", expect: ["Kazananlar", "preview-member"] },
  { path: "/e/ornek-etkinlik/panel", mode: "failed", width: 390, height: 844, name: "panel-mobile-error", expect: ["Teslimde sorun var", "Arşiv deposuna ulaşılamadı"] },
  { path: "/sergi/ornek-etkinlik/1", mode: "failed", width: 390, height: 844, name: "exhibit-mobile", expect: ["Demoyu aç", "Örnek · Akıllı Kampüs"] },
  { path: "/e/ornek-etkinlik/yonetim", mode: "open", width: 390, height: 844, name: "admin-mobile", expect: ["Yönetim", "Diğer sütunları görmek"] },
  { path: "/dogrula", mode: "sealed", width: 390, height: 844, name: "verify-mobile", expect: ["Mühür doğrula", "Kısa commit kodu"] },
];
const browser = await openBrowser();
try {
  for (const item of cases) {
    await fetch(`http://127.0.0.1:54330/fixture/state?mode=${item.mode}`);
    // CDP viewport overrides Chrome's minimum physical window width on Windows.
    await browser.send("Emulation.setDeviceMetricsOverride", { width: item.width, height: item.height, deviceScaleFactor: 1, mobile: item.width < 640 });
    await browser.send("Page.navigate", { url: `http://127.0.0.1:3100${item.path}` });
    await browser.waitFor(`document.querySelector('main') && ${JSON.stringify(item.expect)}.every(text => document.body.innerText.includes(text))`);
    assert.equal(await browser.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${item.name}: yatay taşma`);
    const html = await browser.evaluate("document.documentElement.outerHTML");
    writeFileSync(resolve("test-artifacts", `${item.name}.html`), html);
    const shot = await browser.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(resolve("test-artifacts", `${item.name}.png`), Buffer.from(shot.data, "base64"));
    console.log(`PASS: ${item.name} (${item.width}×${item.height}, taşma yok)`);
  }
} finally { await browser.close(); }
