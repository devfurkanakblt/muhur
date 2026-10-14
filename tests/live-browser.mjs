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
  // Halkın seçimi: oy geri alınmadan başka esere taşınır, sonra eski esere döner. Sayfa yenilenmeden her düğme
  // gösterdiği işi yapmalı; "Oy ver" yazan düğme mevcut oyu silmemeli.
  await fetch("http://127.0.0.1:54330/fixture/state?mode=voting");
  await browser.send("Page.navigate", { url: "http://127.0.0.1:3100/" });
  const button = no => `document.querySelector('input[name=projectId][value="30000000-0000-0000-0000-00000000000${no}"]').form.querySelector('button')`;
  const voted = no => `${button(no)}.getAttribute('aria-pressed') === 'true' && !${button(no)}.disabled`;
  const notVoted = no => `${button(no)}.getAttribute('aria-pressed') === 'false' && !${button(no)}.disabled`;
  // Canlı durum isteği hidrasyondan sonra başlar; öncesinde tıklama React'e ulaşmaz.
  await browser.waitFor(`performance.getEntriesByType('resource').some(e => e.name.includes('/api/durum')) && ${notVoted(2)} && ${notVoted(3)}`);
  for (const [click, on, off] of [[2, 2, 3], [3, 3, 2], [2, 2, 3], [3, 3, 2]]) {
    await browser.evaluate(`${button(click)}.click()`);
    await browser.waitFor(`${voted(on)} && ${notVoted(off)}`);
  }
  console.log("PASS: Oy geri alınmadan eserler arasında art arda taşınır, her seferinde tek oy görünür");
  await browser.evaluate(`${button(3)}.click()`);
  await browser.waitFor(`${notVoted(2)} && ${notVoted(3)}`);
  await browser.evaluate(`${button(2)}.click()`);
  await browser.waitFor(`${voted(2)} && ${notVoted(3)}`);
  await browser.send("Page.reload");
  await browser.waitFor(`document.querySelector('input[name=projectId]') && ${voted(2)} && ${notVoted(3)}`);
  console.log("PASS: Oyu geri alıp yeniden vermek, sayfa yenilendikten sonra da aynı görünür");
  // Kazanan duyurusu: yönetimden eklenen ödül vitrinde büyük görünür; sahne açıkken eklenen ödül tören ile açılır.
  await fetch("http://127.0.0.1:54330/fixture/state?mode=sealed");
  await browser.send("Page.navigate", { url: "http://127.0.0.1:3100/yonetim" });
  await browser.waitFor("document.querySelector('#award-title') && performance.getEntriesByType('resource').some(e => e.name.includes('/api/durum'))");
  await browser.evaluate(`(() => {
    const set = (el, value) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    set(document.querySelector('#award-project'), '30000000-0000-0000-0000-000000000002');
    set(document.querySelector('#award-title'), 'Birincilik');
    set(document.querySelector('#award-reason'), 'Arşivleme akışını uçtan uca, sade ve güvenilir kurdular.');
    document.querySelector('#award-title').form.requestSubmit();
  })()`);
  await browser.waitFor("document.body.innerText.includes('Ödül açıklandı')");
  await browser.send("Page.navigate", { url: "http://127.0.0.1:3100/" });
  await browser.waitFor("document.querySelector('#kazananlar') && document.querySelector('#kazananlar').innerText.includes('Birincilik') && document.querySelector('#kazananlar').innerText.includes('mehmet-k')");
  console.log("PASS: Yönetimden açıklanan ödül vitrinin başında eser, ekip ve gerekçesiyle görünür");
  const live = "document.querySelector('section[aria-label=Kazananlar] [aria-live]')";
  const current = "document.querySelector('section[aria-label=Kazananlar] [aria-current=true]')";
  await browser.send("Page.navigate", { url: "http://127.0.0.1:3100/sahne" });
  await browser.waitFor(`${current} && ${live}.textContent === '' && performance.getEntriesByType('resource').some(e => e.name.includes('/api/sahne'))`);
  console.log("PASS: Sahne açılışında var olan kazananlar törensiz gösterilir");
  await fetch("http://127.0.0.1:54330/rest/v1/rpc/admin_add_award", { method: "POST", body: JSON.stringify({
    p_event: "10000000-0000-0000-0000-000000000001", p_project: "30000000-0000-0000-0000-000000000003", p_title: "Jüri özel ödülü", p_reason: "Erişilebilirliği ilk günden tasarımın merkezine koydular.",
  }) });
  await browser.waitFor(`${live}.textContent.includes('Jüri özel ödülü') && ${current}.textContent.includes('Jüri özel ödülü')`);
  assert.equal(await browser.evaluate("document.querySelector('section[aria-label=Kazananlar]').innerText.includes('zeynep-dbu')"), true);
  console.log("PASS: Sahne açıkken açıklanan ödül birkaç saniye içinde törenle, ekip üyeleriyle gelir");
  await browser.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Sahneye dön')).click()");
  await browser.waitFor("!document.querySelector('section[aria-label=Kazananlar]') && document.querySelector('footer').innerText.includes('Birincilik')");
  await browser.evaluate("[...document.querySelectorAll('footer button')].find(b => b.textContent.includes('Birincilik')).click()");
  await browser.waitFor(`${live} && ${live}.textContent.includes('Birincilik')`);
  console.log("PASS: Gösteri kapatılabilir; alt şeritten seçilen kazananın töreni yeniden oynar");
} finally {
  await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
  await browser.close();
}
