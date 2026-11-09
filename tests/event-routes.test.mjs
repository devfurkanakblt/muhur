import test from "node:test";
import assert from "node:assert/strict";
import { eventPath, isListed, splitHomeEvents, pickLegacyEvent } from "@/lib/event-routes";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();

function ev(id, over = {}) {
  const deadline = over.deadline ?? iso(NOW + 5 * HOUR);
  return {
    id,
    slug: id,
    startsAt: iso(NOW - 24 * HOUR),
    deadline,
    lockedAt: null,
    sealTime: deadline,
    suspended: false,
    communityStatus: "onaylandi",
    ...over,
  };
}

test("eventPath slug ve yüzeyle adres kurar", () => {
  assert.equal(eventPath("ekozeka"), "/e/ekozeka");
  assert.equal(eventPath("ekozeka", "panel"), "/e/ekozeka/panel");
  assert.equal(eventPath("a b/c"), "/e/a%20b%2Fc");
});

test("isListed yalnızca onaylı ve askıda olmayanı alır", () => {
  assert.equal(isListed(ev("a")), true);
  assert.equal(isListed(ev("a", { suspended: true })), false);
  assert.equal(isListed(ev("a", { communityStatus: null })), false);
});

test("splitHomeEvents açık ve onaylı etkinliği active'e koyar", () => {
  const { active, past } = splitHomeEvents([ev("a")], NOW);
  assert.deepEqual(active.map((e) => e.id), ["a"]);
  assert.equal(past.length, 0);
});

test("splitHomeEvents askıdaki, askıda/reddedilmiş topluluğu gizler", () => {
  const { active, past } = splitHomeEvents([
    ev("s", { suspended: true }),
    ev("k", { communityStatus: "askida" }),
    ev("r", { communityStatus: "reddedildi" }),
  ], NOW);
  assert.equal(active.length + past.length, 0);
});

test("son tarihi geçmiş ama kilitsiz etkinlik past'tadır", () => {
  const { active, past } = splitHomeEvents([ev("a", { deadline: iso(NOW - HOUR), sealTime: iso(NOW - HOUR) })], NOW);
  assert.equal(active.length, 0);
  assert.deepEqual(past.map((e) => e.id), ["a"]);
});

test("kilitli etkinlik past'tadır", () => {
  const { active, past } = splitHomeEvents([ev("a", { lockedAt: iso(NOW - HOUR) })], NOW);
  assert.equal(active.length, 0);
  assert.equal(past.length, 1);
});

test("active en yakın son teslim önce sıralanır", () => {
  const { active } = splitHomeEvents([
    ev("geç", { deadline: iso(NOW + 9 * HOUR) }),
    ev("erken", { deadline: iso(NOW + 1 * HOUR) }),
  ], NOW);
  assert.deepEqual(active.map((e) => e.id), ["erken", "geç"]);
});

test("past en çok 12 tane ve en yeni mühür önce", () => {
  const many = Array.from({ length: 14 }, (_, i) => {
    const t = iso(NOW - (i + 1) * HOUR);
    return ev(`p${i}`, { deadline: t, sealTime: t });
  }).reverse();
  const { past } = splitHomeEvents(many, NOW);
  assert.equal(past.length, 12);
  assert.equal(past[0].id, "p0");
  assert.equal(past[11].id, "p11");
});

test("pickLegacyEvent boş listede null", () => {
  assert.equal(pickLegacyEvent([], NOW), null);
});

test("pickLegacyEvent yalnızca geçmişse en yeni mührü seçer", () => {
  const a = ev("eski", { deadline: iso(NOW - 9 * HOUR), sealTime: iso(NOW - 9 * HOUR) });
  const b = ev("yeni", { deadline: iso(NOW - 2 * HOUR), sealTime: iso(NOW - 2 * HOUR) });
  assert.equal(pickLegacyEvent([a, b], NOW).id, "yeni");
});

test("pickLegacyEvent açık varsa onu seçer", () => {
  const past = ev("gecmis", { deadline: iso(NOW - 2 * HOUR), sealTime: iso(NOW - 2 * HOUR) });
  assert.equal(pickLegacyEvent([past, ev("acik")], NOW).id, "acik");
});

test("pickLegacyEvent askıdakini hiç seçmez", () => {
  assert.equal(pickLegacyEvent([ev("s", { suspended: true })], NOW), null);
});
