import test from "node:test";
import assert from "node:assert/strict";
import { can, denialMessage, ASKIDA_MESAJI, YETKISIZ_MESAJI } from "../lib/authz.ts";

const none = { headAdmin: false, communityRole: null, juror: false, eventSuspended: false, communitySuspended: false, locked: false };

test("yonet: yalnızca askıda olmayan topluluk rolü", () => {
  assert.equal(can({ ...none, headAdmin: true }, "yonet"), false);
  assert.equal(can({ ...none, communityRole: "owner" }, "yonet"), true);
  assert.equal(can({ ...none, communityRole: "organizator" }, "yonet"), true);
  assert.equal(can({ ...none, communityRole: "organizator", eventSuspended: true }, "yonet"), false);
  assert.equal(can({ ...none, communityRole: "owner", communitySuspended: true }, "yonet"), false);
  assert.equal(can(none, "yonet"), false);
});

test("isletim: head admin ya da topluluk rolü, askıda da", () => {
  assert.equal(can({ ...none, headAdmin: true }, "isletim"), true);
  assert.equal(can({ ...none, communityRole: "organizator", eventSuspended: true }, "isletim"), true);
  assert.equal(can({ ...none, juror: true }, "isletim"), false);
  assert.equal(can(none, "isletim"), false);
});

test("incele: head admin ya da topluluk rolü, askıda da", () => {
  assert.equal(can({ ...none, headAdmin: true }, "incele"), true);
  assert.equal(can({ ...none, communityRole: "organizator", eventSuspended: true }, "incele"), true);
  assert.equal(can({ ...none, juror: true, locked: true }, "incele"), false);
  assert.equal(can(null, "incele"), false);
});

test("juri-paketi: incele ya da kilitli etkinlikte jüri", () => {
  assert.equal(can({ ...none, juror: true, locked: false }, "juri-paketi"), false);
  assert.equal(can({ ...none, juror: true, locked: true }, "juri-paketi"), true);
  assert.equal(can({ ...none, headAdmin: true }, "juri-paketi"), true);
  assert.equal(can({ ...none, communityRole: "owner" }, "juri-paketi"), true);
  assert.equal(can({ ...none, locked: true }, "juri-paketi"), false);
});

test("askiya-al ve anonimlestir: yalnızca head admin", () => {
  for (const action of ["askiya-al", "anonimlestir"]) {
    assert.equal(can({ ...none, headAdmin: true }, action), true);
    assert.equal(can({ ...none, communityRole: "owner" }, action), false);
    assert.equal(can(null, action), false);
  }
});

test("denialMessage: yalnızca askı yüzünden reddedilince askı mesajı", () => {
  assert.equal(denialMessage({ ...none, communityRole: "owner", communitySuspended: true }, "yonet"), "Bu etkinlik platform tarafından geçici olarak durduruldu.");
  assert.equal(denialMessage({ ...none, communityRole: "organizator", eventSuspended: true }, "yonet"), ASKIDA_MESAJI);
  assert.equal(denialMessage(none, "yonet"), "Yetkisiz");
  assert.equal(denialMessage({ ...none, eventSuspended: true }, "yonet"), YETKISIZ_MESAJI);
  assert.equal(denialMessage({ ...none, headAdmin: true }, "yonet"), "Yetkisiz");
  assert.equal(denialMessage(null, "incele"), "Yetkisiz");
  assert.equal(denialMessage({ ...none, communityRole: "owner", eventSuspended: true }, "askiya-al"), "Yetkisiz");
});

test("yonet: güncel onay eksikse reddedilir ve neyin eksik olduğu söylenir", async () => {
  const { ONAY_MESAJI } = await import("../lib/authz.ts");
  const pending = { ...none, communityRole: "owner", policyPending: true };
  assert.equal(can(pending, "yonet"), false);
  assert.equal(denialMessage(pending, "yonet"), ONAY_MESAJI);
  assert.equal(can(pending, "incele"), true, "salt okuma açık kalır");
  assert.equal(denialMessage({ ...none, policyPending: true }, "yonet"), YETKISIZ_MESAJI, "rolü olmayana onay mesajı gösterilmez");
  assert.equal(denialMessage({ ...pending, eventSuspended: true }, "yonet"), YETKISIZ_MESAJI);
});
