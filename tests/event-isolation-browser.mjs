import assert from "node:assert/strict";
import { openBrowser } from "./browser-driver.mjs";

// Gerçek Server Action istekleri yerel fikstüre gider; canlı hesap/veri kullanılmaz.
const browser = await openBrowser();
try {
  await fetch("http://127.0.0.1:54330/fixture/state?mode=open&coklu=1&rol=sahip");
  await browser.send("Page.navigate", { url: "http://127.0.0.1:3100/e/ornek-etkinlik/yonetim" });
  await browser.waitFor("document.querySelector('#announcement') && performance.getEntriesByType('resource').some(e => e.name.includes('/api/durum'))");
  await browser.evaluate(`(() => {
    const input = document.querySelector('#announcement');
    const form = input.form;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Yetkisiz değişiklik');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Kontrollü alan değişimi yeniden çizer; gizli kimliği sonrasında değiştir.
    input.form.querySelector('input[name=event]').value = '10000000-0000-0000-0000-000000000002';
    form.requestSubmit();
  })()`);
  await browser.waitFor("document.querySelector('#announcement').form.innerText.includes('Yetkisiz')");
  const second = await (await fetch("http://127.0.0.1:54330/rest/v1/events?id=eq.10000000-0000-0000-0000-000000000002")).json();
  assert.equal(second[0].announcement, "İkinci etkinlik duyurusu");
  console.log("PASS: Başka topluluğun etkinlik kimliğiyle gönderilen yönetim formu reddedilir.");

  await browser.send("Page.navigate", { url: "http://127.0.0.1:3100/e/ornek-etkinlik/maskot" });
  await browser.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'İsmi düzenle') && performance.getEntriesByType('resource').some(e => e.name.includes('/api/maskot/durum'))");
  await browser.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'İsmi düzenle').click()");
  await browser.waitFor("document.querySelector('#mascot-name-edit')");
  await browser.evaluate(`(() => {
    const input = document.querySelector('#mascot-name-edit');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Sızan İsim');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Kontrollü alan değişimi yeniden çizer; gizli kimliği sonrasında değiştir.
    input.form.querySelector('input[name=event]').value = '10000000-0000-0000-0000-000000000002';
    input.form.requestSubmit();
  })()`);
  await browser.waitFor("document.querySelector('#mascot-name-edit').form.innerText.includes('Etkinlik bulunamadı.')");
  const proposals = await (await fetch('http://127.0.0.1:54330/rest/v1/mascot_name_proposals')).json();
  assert.equal(proposals.find(p => p.author_id === '00000000-0000-0000-0000-000000000001').name, 'Mırmır');
  console.log("PASS: Maskot eylemi diğer topluluk kimliğiyle çağrıldığında yazmadan reddedilir.");
} finally {
  await browser.close();
  await fetch("http://127.0.0.1:54330/fixture/state?mode=open");
}
