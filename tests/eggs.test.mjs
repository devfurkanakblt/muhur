import test from "node:test";
import assert from "node:assert/strict";
import { exhibitNote } from "../lib/eggs.ts";

test("eser numarası notu yalnızca seçili numaralarda", () => {
  assert.equal(exhibitNote(7), "Mühür. Mühür Bond.");
  assert.equal(exhibitNote(8), undefined);
  assert.equal(exhibitNote(70), undefined);
});
