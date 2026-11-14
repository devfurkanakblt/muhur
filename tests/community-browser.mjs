import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { openBrowser } from "./browser-driver.mjs";
const site="http://127.0.0.1:3100", fixture="http://127.0.0.1:54330";
const state=async(rol="yonetici",mode="open")=>fetch(`${fixture}/fixture/state?rol=${rol}&mode=${mode}`);
const session=await (await fetch(`${fixture}/fixture/session`)).json();
const auth={headers:{Cookie:`${session.name}=${session.value}`}};
const html=async path=>(await fetch(site+path,auth)).text();
await state("basvuran");
assert.ok((await html("/topluluk/basvurularim")).includes("İnceleniyor"));
assert.ok((await html("/topluluk/basvurularim")).includes("Yeni bilgilerle yeniden başvur"));
assert.equal((await fetch(site+"/yonetim/topluluklar",auth)).status,404);
assert.equal((await fetch(site+"/topluluk/deu-csai",auth)).status,404);
await state("organizator");
const organizer=await html("/topluluk/deu-csai");
assert.ok(!organizer.includes("private-applicant@example.test"),"Başvuran iletişimi organizatöre sızdı");
assert.ok(!organizer.includes("Sahipliği devret"));
await state("sahip");
assert.ok((await html("/topluluk/deu-csai")).includes("private-applicant@example.test"));
assert.equal((await fetch(site+"/topluluk/baska-topluluk",auth)).status,404);
await state("linkedin");
const jury=await html("/e/ornek-etkinlik/juri");
assert.ok(jury.includes("Teslim süresi henüz dolmadı"));
assert.ok(!(await html("/e/ornek-etkinlik/panel")).includes("Depoların"));
assert.equal((await fetch(site+"/yonetim",auth)).status,404);
assert.equal((await fetch(site+"/e/ornek-etkinlik/yonetim",auth)).status,404);
await state("linkedin","sealed");
const sealed=await html("/e/ornek-etkinlik/juri");
assert.ok(sealed.includes("Mühürlü teslimleri ZIP indir")); assert.ok(!sealed.includes('name="decision"'));
const token="a".repeat(43);
for(const char of ["b","c","x"]) {const text=await html(`/katil/${char.repeat(43)}`);assert.ok(text.includes("Bu davet kullanılamıyor"));assert.ok(!text.includes("invite-private@example.test"));}
const invite=await fetch(`${site}/katil/${token}`);
assert.equal(invite.headers.get("referrer-policy"),"no-referrer");assert.equal(invite.headers.get("x-robots-tag"),"noindex, nofollow");
const anon=await invite.text(); assert.ok(anon.includes("GitHub ile giriş yap")&&anon.includes("LinkedIn ile giriş yap"));
assert.ok(!anon.includes("invite-private@example.test"));
assert.equal((await fetch(site+"/api/cron/mail")).status,401);
const cron=await fetch(site+"/api/cron/mail",{headers:{Authorization:"Bearer fixture-cron"}});
assert.deepEqual(await cron.json(),{configured:false,processed:0});
assert.equal((await fetch(site+"/api/webhooks/brevo",{method:"POST",body:"{}"})).status,401);
assert.equal((await fetch(site+"/api/webhooks/brevo",{method:"POST",headers:{Authorization:"Bearer fixture-webhook"},body:"x".repeat(65537)})).status,413);
assert.equal((await fetch(site+"/kosullar/platform/test-1")).status,200);
console.log("PASS: Başvuru gizliliği, kapsam yetkileri, LinkedIn jüri, davet GET ve mail uçları");
const browser=await openBrowser();
try {
 const cases=[
  ["/topluluk/basvur","basvuran","Topluluğunu kaydet","application"],
  [`/katil/${token}`,"linkedin","Daveti kabul et","invite"],
  ["/topluluk/deu-csai","sahip","Organizatör davet et","community"],
  ["/yonetim/topluluklar","yonetici","Gerekçeyle reddet","review"],
 ];
 for(const [path,rol,expected,name] of cases) for(const width of [1366,390]) {
  await state(rol);
  await browser.send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<640});
  await browser.send("Page.navigate",{url:site+path});
  await browser.waitFor(`document.querySelector('main') && document.body.innerText.includes(${JSON.stringify(expected)})`);
  assert.equal(await browser.evaluate("document.documentElement.scrollWidth <= innerWidth"),true,`${name}: taşma`);
  const shot=await browser.send("Page.captureScreenshot",{format:"png"});writeFileSync(`test-artifacts/plan3-${name}-${width}.png`,Buffer.from(shot.data,"base64"));
  console.log(`PASS: Plan 3 ${name} ${width}px`);
 }
 // Başvuru formunda iki ayrı açık onay zorunlu; sunucu hatası taslağı korur.
 await state("basvuran"); await browser.send("Page.navigate",{url:site+"/topluluk/basvur"});
 await browser.waitFor("document.querySelector('[name=contact_phone]')");
 await browser.evaluate(`(() => {const values={name:'Taslak Topluluk',slug:'taslak-topluluk',contact_name:'Test Sorumlu',contact_email:'test@example.test',contact_phone:'+905551234567'};for(const [name,value] of Object.entries(values)){const input=document.querySelector('[name='+name+']');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
 assert.equal(await browser.evaluate("document.querySelector('input[name=accept_platform]').checked"),false);
 assert.equal(await browser.evaluate("document.querySelector('input[name=accept_data_processing]').checked"),false);
 await browser.evaluate("document.querySelector('input[name=accept_platform]').click()");
 assert.equal(await browser.evaluate("document.querySelector('form:has([name=contact_phone])').checkValidity()"),false);
 await browser.evaluate("document.querySelector('input[name=accept_data_processing]').click()");
 // hidden alan sahteciliği: sunucu belge kimliğini reddeder, girilen metin kaybolmaz.
 await browser.evaluate("document.querySelector('[name=request_id]').value='forged';document.querySelector('form:has([name=contact_phone])').requestSubmit()");
 await browser.waitFor("document.querySelector('[role=alert]')?.innerText.includes('Belge veya istek bilgisi')");
 assert.equal(await browser.evaluate("document.querySelector('[name=name]').value"),"Taslak Topluluk");
 assert.equal(await browser.evaluate("document.querySelector('input[name=accept_data_processing]').checked"),true);
 console.log("PASS: Ayrı onaylar, sunucu kimlik doğrulaması ve hata sonrası taslak korunması");
 // Head admin formu açıkken oturum başka role döner: eski ekran onay yetkisi vermez.
 await state();await browser.send("Page.navigate",{url:site+"/yonetim/topluluklar"});
 await browser.waitFor("document.querySelector('button[name=decision]')");
 await state("sahip");await browser.evaluate("document.querySelector('button[name=decision][value=onaylandi]').click()");
 await browser.waitFor("document.querySelector('[role=alert]')?.innerText.includes('Yetkisiz')");
 console.log("PASS: Açık eski form güncel head admin yetkisi olmadan karar yazamaz");
 assert.equal(browser.errors.length,0,browser.errors.join("\n"));
} finally {await browser.close();await state();}
