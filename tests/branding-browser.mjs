// Plan 5 görsel kontrol: iki topluluk, masaüstü/390px, açık/koyu tema, azaltılmış hareket. Ekran görüntüleri
// test-artifacts/plan5-*.png olarak yazılır ve elle incelenir (metin araması tek başına görsel doğrulama değildir).
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openBrowser } from "./browser-driver.mjs";

const browser = await openBrowser();
const shot = async (name) => {
  const { data } = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(resolve("test-artifacts", `${name}.png`), Buffer.from(data, "base64"));
};
const MASCOT_MARK = "M280 29C283 32";
try {
  await fetch("http://127.0.0.1:54330/fixture/state?mode=open&coklu=1&rol=sahip");
  for (const [width, label] of [[1280, "masaustu"], [390, "390"]]) {
    await browser.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    for (const scheme of ["light", "dark"]) {
      await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] });
      for (const slug of ["ornek-etkinlik", "ikinci-etkinlik"]) {
        await browser.send("Page.navigate", { url: `http://127.0.0.1:3100/e/${slug}` });
        await browser.waitFor("document.readyState === 'complete' && document.querySelector('header')");
        const info = await browser.evaluate(`(() => {
          const scope = document.querySelector('[data-accent]');
          const title = document.querySelector('header .text-brand');
          return {
            mascotSvg: [...document.querySelectorAll('svg path')].some(p => (p.getAttribute('d') || '').startsWith(${JSON.stringify(MASCOT_MARK)})),
            mystery: !!document.querySelector('#mystery-title'),
            rootIndigo: getComputedStyle(document.documentElement).getPropertyValue('--indigo').trim(),
            accent: scope ? getComputedStyle(scope).getPropertyValue('--accent').trim() : null,
            titleColor: title ? getComputedStyle(title).color : null,
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          };
        })()`);
        assert.equal(info.overflow, false, `${slug} ${label} ${scheme}: yatay taşma`);
        if (slug === "ikinci-etkinlik") {
          assert.equal(info.mascotSvg, false, `${slug}: maskot çizildi`);
          assert.equal(info.mystery, false, `${slug}: gizem penceresi monte edildi`);
          assert.ok(info.accent && info.accent !== info.rootIndigo, `${slug}: etkinlik rengi uygulanmadı`);
        } else {
          assert.equal(info.mascotSvg, true, "DEÜ maskotu kayboldu");
        }
        await shot(`plan5-${slug}-${label}-${scheme}`);
      }
    }
  }
  console.log("PASS: İki topluluk masaüstü/390px, açık/koyu temada yatay taşmasız; maskot ve gizem yalnız DEÜ'de; renk etkinlik kapsamında.");

  // Yönetim formu: okunamayan renk istemcide de reddedilir ve öneri gösterilir (sunucu/DB ayrıca denetler).
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await fetch("http://127.0.0.1:54330/fixture/state?mode=open&rol=sahip");
  await browser.send("Page.navigate", { url: "http://127.0.0.1:3100/e/ornek-etkinlik/yonetim" });
  await browser.waitFor("document.querySelector('input[name=accent_default]')");
  // Hidrasyon ve canlı yenileme sırasında yapılan tıklama React durumuna yansımayabilir: alan görünene kadar
  // her yarım saniyede bir yeniden dene (kutu işaretliyse "platform rengi" kapatılır).
  await browser.waitFor(`(() => {
    if (document.querySelector('#accent-hex')) return true;
    const now = Date.now();
    if (!window.__lastToggle || now - window.__lastToggle > 500) { window.__lastToggle = now; document.querySelector('input[name=accent_default]').click(); }
    return false;
  })()`);
  await browser.evaluate(`(() => {
    const input = document.querySelector('#accent-hex');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#ffff00');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.waitFor("document.querySelector('#accent-status')?.innerText.includes('Önerilen yakın tonu kullan')");
  const disabled = await browser.evaluate("[...document.querySelectorAll('button[type=submit]')].find(b => b.textContent.includes('Görünümü kaydet')).disabled");
  assert.equal(disabled, true, "Okunamayan renkle kaydet düğmesi etkin.");
  await browser.evaluate("document.querySelector('#accent-status button').scrollIntoView({ block: 'center' })");
  await shot("plan5-yonetim-renk-onerisi");
  await browser.evaluate("document.querySelector('#accent-status button').click()");
  await browser.waitFor("document.querySelector('#accent-status')?.innerText.includes('iki temada da okunabilir')");
  console.log("PASS: Okunamayan renk öneriyle reddedilir; öneri uygulanınca form kaydedilebilir.");
  assert.deepEqual(browser.errors.filter(e => !/favicon|Failed to load resource|_next\/hmr/.test(e)), [], "Tarayıcı hataları");
} finally {
  await browser.close();
  await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
}
