import test from "node:test";
import assert from "node:assert/strict";
import { captureSubmission, hashArchive, validateArchive, verifySealedArchive } from "../lib/delivery-core.ts";
import { ARCHIVE_LIMIT_BYTES, deliveryState, safeDemoUrl, serverTimeAt, canDownloadArchive } from "../lib/delivery-policy.ts";
import { zipEntries } from "../lib/zip.ts";

const sha = "a".repeat(40);
const job = { id: "job-1", project_id: "p1", event_id: "e1", kind: "submit", sha, repo_full_name: "team/project", branch: "main", lease_token: "lease-1", attempts: 1 };
async function validZip(text = "accepted code") {
  const parts = [];
  for await (const part of zipEntries([{ name: "README.md", read: async () => new TextEncoder().encode(text) }])) parts.push(Buffer.from(part));
  return new Uint8Array(Buffer.concat(parts));
}

test("repo değişse bile arşiv isteğinde seçilen SHA kullanılır", async () => {
  const zip = await validZip();
  let stored;
  let accepted;
  const result = await captureSubmission(job, {
    download: async (name, selected) => { assert.equal(name, "team/project"); assert.equal(selected, sha); return zip; },
    read: async () => stored ?? null,
    write: async (_path, bytes) => { stored = bytes; },
    complete: async (...fields) => { accepted = fields; return true; },
  });
  assert.equal(result, true);
  assert.deepEqual(accepted, ["teslim/job-1.zip", hashArchive(zip), zip.length]);
});

test("depodaki kopya bozulduğunda teslim kabul edilmez", async () => {
  const zip = await validZip();
  let stored;
  let completed = false;
  await assert.rejects(captureSubmission(job, {
    download: async () => zip, read: async () => stored ?? null,
    write: async (_path, bytes) => { stored = bytes.slice(); stored[20] ^= 1; },
    complete: async () => { completed = true; return true; },
  }), /bütünlük/);
  assert.equal(completed, false);
});

test("depo hatası ve başarısız indirme kabul işlemini çağırmaz", async () => {
  let completed = false;
  await assert.rejects(captureSubmission(job, {
    download: async () => { throw new Error("GitHub 404"); }, read: async () => null,
    write: async () => {}, complete: async () => { completed = true; return true; },
  }), /404/);
  assert.equal(completed, false);
});

test("indirme bittiğinde süre dolmuşsa başarılı teslim sonucu üretilmez", async () => {
  const zip = await validZip();
  const result = await captureSubmission(job, {
    download: async () => { throw new Error("mevcut arşiv tekrar indirilmemeli"); }, read: async () => zip,
    write: async () => {}, complete: async () => false,
  });
  assert.equal(result, false);
});

test("yeniden deneme var olan değiştirilemez arşivi kullanır", async () => {
  const zip = await validZip();
  let writes = 0;
  assert.equal(await captureSubmission({ ...job, attempts: 2 }, {
    read: async () => zip, download: async () => { throw new Error("yeniden indirilmemeli"); },
    write: async () => { writes++; }, complete: async (_path, hash) => hash === hashArchive(zip),
  }), true);
  assert.equal(writes, 0);
});

test("private veya silinmiş repo, kabul edilmiş arşivin mühürlenmesini engellemez", async () => {
  const zip = await validZip();
  await verifySealedArchive("teslim/id.zip", hashArchive(zip), zip.length, async () => zip);
});

test("mühürlenen arşivde farklı hash, boyut veya eksik dosya reddedilir", async () => {
  const zip = await validZip();
  await assert.rejects(verifySealedArchive("id", "0".repeat(64), zip.length, async () => zip), /bütünlüğü/);
  await assert.rejects(verifySealedArchive("id", hashArchive(zip), zip.length + 1, async () => zip), /bütünlüğü/);
  await assert.rejects(verifySealedArchive("id", hashArchive(zip), zip.length, async () => null), /bulunamadı/);
});

test("50 MB sınırı ve ZIP olmayan yanıt reddedilir", () => {
  assert.throws(() => validateArchive(new Uint8Array(ARCHIVE_LIMIT_BYTES + 1)), /50 MB/);
  assert.throws(() => validateArchive(new TextEncoder().encode("GitHub unavailable")), /ZIP/);
});

test("durumlar kayıt, kabul, kilit, başarısızlık ve gerçek mühür arasında ayrılır", () => {
  assert.equal(deliveryState({}, false), "registered");
  assert.equal(deliveryState({}, false, true), "processing");
  assert.equal(deliveryState({ accepted_sha: sha }, false), "accepted");
  assert.equal(deliveryState({ accepted_sha: sha }, true), "locked");
  assert.equal(deliveryState({}, true), "failed");
  assert.equal(deliveryState({ accepted_sha: sha, delivery_error: "failed update" }, false), "failed");
  assert.equal(deliveryState({ archive_sha256: "hash" }, true), "sealed");
});

test("cihaz saati değişse bile monoton sunucu saati geri gitmez", () => {
  assert.equal(serverTimeAt(1000000, 100, 2100), 1002000);
  assert.equal(serverTimeAt(1000000, 100, 90), 1000000);
});

test("arşiv yalnızca yönetici ve o projenin üyelerine açıktır", () => {
  assert.equal(canDownloadArchive(null, ["owner"]), false);
  assert.equal(canDownloadArchive({ id: "visitor", isAdmin: false }, ["owner"]), false);
  assert.equal(canDownloadArchive({ id: "owner", isAdmin: false }, ["owner"]), true);
  assert.equal(canDownloadArchive({ id: "admin", isAdmin: true }, []), true);
});

test("demo URL doğrulaması HTTPS ister, kullanıcı bilgisi ve script URL reddeder", () => {
  assert.equal(safeDemoUrl(""), null);
  assert.equal(safeDemoUrl("https://demo.example.com"), "https://demo.example.com/");
  for (const bad of ["javascript:alert(1)", "http://demo.example.com", "https://user:secret@example.com", "bad"]) {
    assert.throws(() => safeDemoUrl(bad));
  }
});
