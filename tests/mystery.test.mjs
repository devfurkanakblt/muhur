import test from "node:test";
import assert from "node:assert/strict";
import { isMysteryAnswer, mysteryOpen } from "../lib/mystery.ts";

test("Gizem: videodaki cümle aynen kabul edilir", () => {
  assert.equal(isMysteryAnswer("Ekoloji <3 Yapay Zeka"), true);
});

test("Gizem: yazım farkları kabul edilir", () => {
  for (const variant of [
    "ekoloji <3 yapay zeka",
    "EKOLOJİ <3 YAPAY ZEKA",
    "Ekoloji <3 Yapay Zekâ",
    "  Ekoloji   <3   Yapay Zeka  ",
    "Ekoloji<3Yapay Zeka",
    "\"Ekoloji <3 Yapay Zeka\"",
    "Ekoloji ❤️ Yapay Zeka",
    "Ekoloji ♥ Yapay Zeka!",
  ]) assert.equal(isMysteryAnswer(variant), true, variant);
});

test("Gizem: yanlış ya da eksik cevap kabul edilmez", () => {
  for (const wrong of ["", "Ekoloji Yapay Zeka", "Ekoloji <3", "Ekoloji </3 Yapay Zeka", "Yapay Zeka <3 Ekoloji", "Ekoloji <3 Yapay Zeka ^^", "x".repeat(500)]) {
    assert.equal(isMysteryAnswer(wrong), false, wrong);
  }
});

test("Gizem: yalnızca hackathon saatlerinde açık", () => {
  const event = { startsAt: "2026-11-06T17:00:00Z", sealTime: "2026-11-07T17:00:00Z", locked: false };
  assert.equal(mysteryOpen(event, Date.parse("2026-11-06T16:59:59Z")), false);
  assert.equal(mysteryOpen(event, Date.parse("2026-11-06T17:00:00Z")), true);
  assert.equal(mysteryOpen(event, Date.parse("2026-11-07T16:59:59Z")), true);
  assert.equal(mysteryOpen(event, Date.parse("2026-11-07T17:00:00Z")), false);
  assert.equal(mysteryOpen({ ...event, locked: true }, Date.parse("2026-11-07T10:00:00Z")), false);
});
