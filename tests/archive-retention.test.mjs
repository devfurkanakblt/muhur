import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { archiveAvailability, archiveExpiresAt, signedUrlSeconds } from "../lib/archive-retention.ts";
import { manifestHash, manifestLines } from "../lib/archive-manifest.ts";

const locked = "2026-10-01T10:00:00.000Z";
const expires = archiveExpiresAt(locked);
const at = (ms) => new Date(expires).getTime() + ms;

test("vade kalıcı kilitten tam 720 saat; kilit yoksa yok", () => {
  assert.equal(expires, "2026-10-31T10:00:00.000Z");
  assert.equal(archiveExpiresAt(null), null);
});

test("eşikler: 30 gün eksi 1 ms indirilebilir, tam eşik ve artı 1 ms süre dolmuş", () => {
  assert.equal(archiveAvailability(expires, at(-1)), "expiring");
  assert.equal(archiveAvailability(expires, at(0)), "expired");
  assert.equal(archiveAvailability(expires, at(1)), "expired");
  assert.equal(archiveAvailability(expires, at(-73 * 3600_000)), "available");
  assert.equal(archiveAvailability(null, Date.now()), "available");
});

test("imzalı URL ömrü kalan saklama süresini aşmaz; süre azsa yeni URL yok", () => {
  assert.equal(signedUrlSeconds(null), 60);
  assert.equal(signedUrlSeconds(3600), 60);
  assert.equal(signedUrlSeconds(30), 30);
  assert.equal(signedUrlSeconds(9), null);
  assert.equal(signedUrlSeconds(0), null);
  assert.equal(signedUrlSeconds(Number.NaN), null);
});

test("manifest özeti deterministik; satır sırası ve kaynak sırası sonucu değiştirmez", () => {
  const rows = [
    { path: "teslim/b.zip", bytes: 2, sha256: "b".repeat(64) },
    { path: "ara-muhur/x/001-aaaaaaa.zip", bytes: "1", sha256: "a".repeat(64) },
    { path: "teslim/a.zip", bytes: null, sha256: null },
  ];
  assert.equal(manifestHash(rows), manifestHash([...rows].reverse()));
  assert.deepEqual(manifestLines(rows)[0], `ara-muhur/x/001-aaaaaaa.zip\t1\t${"a".repeat(64)}`);
  assert.equal(manifestLines(rows)[1], "teslim/a.zip\t\t");
  assert.notEqual(manifestHash(rows), manifestHash(rows.slice(1)));
});

test("kuru koşum betiği salt okunur: Storage silme ya da defter yazma çağrısı içermez", () => {
  const source = readFileSync(new URL("../scripts/preview-archive-expiry.mjs", import.meta.url), "utf8");
  for (const forbidden of [".remove(", "storage.from", "prepare_archive_expiry", "claim_archive_expiry", "complete_archive_expiry", ".insert(", ".update(", ".delete("]) {
    assert.ok(!source.includes(forbidden), `Betik '${forbidden}' içeriyor.`);
  }
});
