import test from "node:test";
import assert from "node:assert/strict";
import { nextShowing, SHOW } from "../lib/winner-show.ts";
import { winnerAnnouncement } from "../lib/winner-model.ts";

const show = (id, ceremony, since, run = 1) => ({ id, ceremony, since, run });

test("yeni açıklanan ödül sessiz dönüşü hemen keser ve törenle gelir", () => {
  const plan = nextShowing(show("a", false, 0), ["b"], ["a", "b"], 5_000);
  assert.deepEqual(plan, { at: 5_000, showing: show("b", true, 5_000, 2), queue: [] });
});

test("tören bitmeden gelen ödül sırada bekler, ardından kendi töreniyle açılır", () => {
  const plan = nextShowing(show("a", true, 1_000), ["b", "c"], ["a", "b", "c"], 3_000);
  assert.equal(plan.at, 1_000 + SHOW.ceremonyHold);
  assert.deepEqual(plan.showing, show("b", true, 1_000 + SHOW.ceremonyHold, 2));
  assert.deepEqual(plan.queue, ["c"]);
});

test("kaldırılan ödül sıradan düşer; ekrandaysa hemen sıradakine geçilir", () => {
  assert.equal(nextShowing(show("a", true, 0), ["x"], ["a"], 1_000), null);
  assert.deepEqual(nextShowing(show("x", true, 0), [], ["a", "b"], 1_000), { at: 1_000, showing: show("a", false, 1_000, 2), queue: [] });
  assert.deepEqual(nextShowing(show("x", false, 0), [], [], 1_000), { at: 1_000, showing: null, queue: [] });
});

test("tek kazanan ekranda kalır; birden çoksa tören sonrası ve aralıklarla sırayla döner", () => {
  assert.equal(nextShowing(show("a", true, 0), [], ["a"], 60_000), null);
  assert.equal(nextShowing(null, [], [], 0), null);
  assert.deepEqual(nextShowing(null, [], ["a", "b"], 10), { at: 10, showing: show("a", false, 10, 1), queue: [] });
  assert.equal(nextShowing(show("a", true, 0), [], ["a", "b"], 10).at, SHOW.ceremonyHold);
  const quiet = nextShowing(show("b", false, 100), [], ["a", "b"], 200);
  assert.deepEqual(quiet, { at: 100 + SHOW.rotate, showing: show("a", false, 100 + SHOW.rotate, 2), queue: [] });
});

const winner = (over = {}) => ({
  id: "w1", kind: "juri", title: "En iyi teknik çözüm", reason: "Kod <temiz> & test edilmiş.", votes: null,
  projectId: "p1", no: 4, name: "Akıllı Kampüs", team: "Ekip & Co", logo: null, href: "/sergi/2026/4",
  members: [{ login: "ayse", avatar: null }, { login: "mehmet", avatar: null }], ...over,
});

test("jüri duyurusu ödül, eser, ekip, gerekçe ve bağlantıyı HTML güvenli biçimde taşır", () => {
  const text = winnerAnnouncement([winner()], "https://muhur.example/").join("\n");
  assert.match(text, /^🏆 <b>Jüri ödülü: En iyi teknik çözüm<\/b>/);
  assert.match(text, /<b>Akıllı Kampüs<\/b> · Ekip &amp; Co/);
  assert.match(text, /Ekip: ayse, mehmet/);
  assert.match(text, /<i>“Kod &lt;temiz&gt; &amp; test edilmiş.”<\/i>/);
  assert.match(text, /<a href="https:\/\/muhur\.example\/sergi\/2026\/4">No\. 004 · Eseri vitrinde gör<\/a>/);
  assert.doesNotMatch(text, / oy\n/);
});

test("halkın seçimi oy sayısını verir; berabere kalan eserler aynı duyuruda sıralanır", () => {
  const people = { kind: "halk", title: "Halkın seçimi", reason: null, votes: 12 };
  const single = winnerAnnouncement([winner(people)], "https://muhur.example").join("\n");
  assert.match(single, /^❤️ <b>Halkın seçimi<\/b>/);
  assert.match(single, /\n12 oy\n/);
  const tie = winnerAnnouncement([winner(people), winner({ ...people, id: "w2", name: "İkinci", no: 7, href: "/sergi/2026/7", members: [] })], "https://muhur.example");
  assert.match(tie[0], /Halkın seçimi: berabere/);
  assert.equal(tie.filter((line) => line.includes("Eseri vitrinde gör")).length, 2);
  assert.deepEqual(winnerAnnouncement([], "https://muhur.example"), []);
});
