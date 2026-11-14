import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { notify, notifyEvent } from "../lib/notify.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

/** Telegram API'sini taklit eder; `failing` içindeki yöntemler ok:false döner. */
function telegram(failing = []) {
  process.env.TELEGRAM_BOT_TOKEN = "bot-token";
  process.env.TELEGRAM_CHAT_ID = "@kanal";
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const method = String(url).split("/").at(-1);
    calls.push({ method, body: JSON.parse(init.body) });
    const ok = !failing.includes(method);
    return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 400 });
  };
  return calls;
}

test("kazanan kartı verilirse duyuru stikırın ardından kartın altında tek mesaj olarak gider", async () => {
  const calls = telegram();
  assert.equal(await notify(["🏆 <b>Jüri ödülü</b>", "Eser"], "kazanan", { photo: "https://muhur.example/api/kazanan/a1" }), true);
  assert.deepEqual(calls.map((c) => c.method), ["sendSticker", "sendPhoto"]);
  assert.deepEqual(calls[1].body, {
    chat_id: "@kanal", photo: "https://muhur.example/api/kazanan/a1", caption: "🏆 <b>Jüri ödülü</b>\nEser", parse_mode: "HTML",
  });
});

test("Telegram kartı alamazsa aynı duyuru düz metin olarak gönderilir", async () => {
  const calls = telegram(["sendPhoto"]);
  assert.equal(await notify(["🏆 <b>Jüri ödülü</b>", "Eser"], undefined, { photo: "https://muhur.example/api/kazanan/a1" }), true);
  assert.deepEqual(calls.map((c) => c.method), ["sendPhoto", "sendMessage"]);
  assert.equal(calls[1].body.text, "🏆 <b>Jüri ödülü</b>\nEser");
});

test("görsel altı sınırını aşan duyuru kartsız, düz metin gider", async () => {
  const calls = telegram();
  assert.equal(await notify(["x".repeat(1100)], undefined, { photo: "https://muhur.example/kart" }), true);
  assert.deepEqual(calls.map((c) => c.method), ["sendMessage"]);
});

test("bot ayarlı değilse hiçbir istek yapılmaz; Telegram hatası akışı bozmaz", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("ağ yok"); };
  assert.equal(await notify(["Duyuru"]), false);
  assert.equal(called, false);
  telegram();
  globalThis.fetch = async () => { throw new Error("ağ yok"); };
  assert.equal(await notify(["Duyuru"], "kazanan", { photo: "https://muhur.example/kart" }), false);
});

test("Telegram'ı kapalı topluluğun etkinliği ağa hiç çıkmaz; açık olanınki gider", async () => {
  const calls = telegram();
  assert.equal(await notifyEvent({ telegram: false }, ["x"]), false);
  assert.equal(calls.length, 0);
  assert.equal(await notifyEvent({ telegram: true }, ["x"]), true);
  assert.deepEqual(calls.map((c) => c.method), ["sendMessage"]);
});
