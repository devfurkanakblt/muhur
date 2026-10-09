import assert from "node:assert/strict";
import { openBrowser } from "./browser-driver.mjs";

// Browser interactions against the read-only local fixture, never live accounts.
const browser = await openBrowser();
try {
  await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
  await browser.send("Page.navigate", { url: "http://127.0.0.1:3100/yonetim" });
  await browser.waitFor("document.querySelector('#announcement') && document.querySelector('#starts')");
  // Wait for the client live monitor to run, then modify two distinct forms.
  await browser.waitFor("performance.getEntriesByType('resource').some(e => e.name.includes('/api/durum'))");
  await browser.evaluate(`(() => {
    const field = document.querySelector('#starts'); field.value = '2026-10-04T12:00'; field.dispatchEvent(new Event('input', { bubbles: true }));
    const input = document.querySelector('#announcement');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Korunacak duyuru');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new Event('muhur:refresh-requested'));
  })()`);
  await browser.waitFor("document.body.innerText.includes('sayfa yenilemesi bekletiliyor')");
  assert.equal(await browser.evaluate("document.querySelector('#announcement').value"), "Korunacak duyuru");
  // Discard one form: the other draft must still prevent refresh.
  await browser.evaluate("document.querySelector('#starts').form.reset()");
  assert.equal(await browser.evaluate("document.body.innerText.includes('sayfa yenilemesi bekletiliyor')"), true);
  assert.equal(await browser.evaluate("document.querySelector('#announcement').value"), "Korunacak duyuru");
  console.log("PASS: İki form, tek form iptali ve ortak refresh koruması");
  await browser.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Güncel durumu göster').click()");
  await browser.waitFor("document.querySelector('dialog[open]')");
  await browser.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Düzenlemeye dön').click()");
  assert.equal(await browser.evaluate("document.querySelector('#announcement').value"), "Korunacak duyuru");
  console.log("PASS: Yenileme onayından vazgeçince taslak korunur");
  // Deliberately fail status requests in this page's fetch wrapper.
  await browser.evaluate(`(() => {
    window.originalFetch = window.fetch;
    window.fetch = (url, options) => String(url).includes('/api/durum') ? Promise.reject(new Error('fixture offline')) : window.originalFetch(url, options);
    window.dispatchEvent(new Event('online'));
  })()`);
  await browser.waitFor("document.body.innerText.includes('Güncel durum alınamadı')");
  assert.equal(await browser.evaluate("document.querySelector('#announcement').value"), "Korunacak duyuru");
  await browser.evaluate("window.fetch = window.originalFetch; window.dispatchEvent(new Event('online'))");
  await browser.waitFor("!document.body.innerText.includes('Güncel durum alınamadı')");
  console.log("PASS: Offline/online durumunda taslak ve bağlantı uyarısı");
  // Change event while forms are dirty: live data must defer without removing forms.
  await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed");
  await browser.evaluate("window.dispatchEvent(new Event('online'))");
  await browser.waitFor("document.body.innerText.includes('sayfa yenilemesi bekletiliyor')");
  assert.equal(await browser.evaluate("document.querySelector('#announcement').value"), "Korunacak duyuru");
  console.log("PASS: Kilit durumunda düzenlenen form korunur");
  // Read-only fixture rejects writes: a real action failure must retain input values.
  await browser.evaluate("document.querySelector('#announcement').form.requestSubmit()");
  await browser.waitFor("document.querySelector('#announcement') && document.querySelector('#announcement').form.querySelector('[role=status]').innerText.length > 0");
  assert.equal(await browser.evaluate("document.querySelector('#announcement').value"), "Korunacak duyuru");
  console.log("PASS: Server Action hata yanıtı formu sıfırlamaz");
  // Slow the action transport, then submit three times in the same JavaScript turn.
  await fetch("http://127.0.0.1:54330/fixture/state?mode=voting");
  await browser.send("Page.navigate", { url: "http://127.0.0.1:3100/yonetim" });
  await browser.waitFor("document.querySelector('input[name=state][value=sonuclandi]') && performance.getEntriesByType('resource').some(e=>e.name.includes('/api/durum'))");
  await browser.evaluate(`(() => {
    window.actionPosts = 0; window.originalFetch = window.fetch;
    window.fetch = async (url, options) => {
      if (new Headers(options?.headers).has('Next-Action')) {
        window.actionPosts++;
        await new Promise(resolve=>setTimeout(resolve,2500));
      }
      return window.originalFetch(url, options);
    };
    const form = document.querySelector('input[name=state][value=sonuclandi]').form;
    form.requestSubmit(); form.requestSubmit(); form.requestSubmit();
  })()`);
  await browser.waitFor("document.querySelector('input[name=state][value=sonuclandi]').form.querySelector('button').disabled");
  assert.equal(await browser.evaluate("window.actionPosts"), 1);
  await browser.evaluate("document.querySelector('input[name=state][value=sonuclandi]').form.requestSubmit()");
  assert.equal(await browser.evaluate("window.actionPosts"), 1);
  await browser.waitFor("!document.querySelector('input[name=state][value=sonuclandi]').form.querySelector('button').disabled");
  assert.equal(await browser.evaluate("window.actionPosts"), 1);
  console.log("PASS: Yavaş sonuç açıklama işleminde 4 gönderim denemesi yalnızca 1 istek üretir");
  await browser.evaluate("document.querySelector('input[name=state][value=sonuclandi]').form.requestSubmit()");
  await browser.waitFor("window.actionPosts === 2");
  await browser.waitFor("!document.querySelector('input[name=state][value=sonuclandi]').form.querySelector('button').disabled");
  console.log("PASS: Önceki işlem tamamlandıktan sonra düğme yeniden kullanılabilir");
} finally {
  await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
  await browser.close();
}
