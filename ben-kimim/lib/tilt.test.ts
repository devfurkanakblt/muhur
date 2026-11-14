import { test } from "node:test";
import assert from "node:assert/strict";
import { createTiltReader, screenFacing } from "./tilt.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≈ ${b}`);

test("ekran yönü: masada yukarı, alında dik, yere dönük", () => {
  near(screenFacing(0, 0), 1); // masada, ekran tavana
  near(screenFacing(90, 0), 0); // dikey tutuş, alında
  near(screenFacing(0, 90), 0); // yatay tutuş, alında
  near(screenFacing(0, -90), 0); // ters yatay tutuş
  near(screenFacing(180, 0), -1); // masada, ekran yere
  assert.ok(screenFacing(-150, 30) < -0.5); // yatay tutuşta öne eğilmiş
});

test("dik konum görülmeden hareket sayılmaz", () => {
  const read = createTiltReader();
  assert.equal(read(0.9), null);
  assert.equal(read(0.1), null);
  assert.equal(read(-0.8), "dogru");
});

test("bir eğme bir kez sayılır, dik konuma dönünce yeniden kurulur", () => {
  const read = createTiltReader();
  read(0);
  assert.equal(read(0.7), "pas");
  assert.equal(read(0.9), null);
  assert.equal(read(0.4), null);
  assert.equal(read(-0.7), null);
  read(0.05);
  assert.equal(read(-0.7), "dogru");
});
