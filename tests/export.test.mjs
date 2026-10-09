import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { crc32, zipEntries, csvTable } from "../lib/zip.ts";
import { qrCenterHole, qrMatrix, qrSvg } from "../lib/qr.ts";
import { filterGallery } from "../lib/gallery.ts";

test("CRC32 standart doğrulama vektörü", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("toplu ZIP bağımsız Python zipfile ile açılır ve Türkçe dosya adı korunur", async () => {
  const parts = [];
  for await (const part of zipEntries([
    { name: "teslimler.json", read: async () => new TextEncoder().encode('{"proje":"mühür"}') },
    { name: "arsivler/örnek.txt", read: async () => new TextEncoder().encode("Doğrulandı") },
  ])) parts.push(Buffer.from(part));
  const result = spawnSync("python", ["-c", "import sys,zipfile,io,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; assert z.read('arsivler/örnek.txt').decode()=='Doğrulandı'; print(json.dumps(z.namelist(),ensure_ascii=True))"], { input: Buffer.concat(parts), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ["teslimler.json", "arsivler/örnek.txt"]);
});

test("CSV formül enjeksiyonunu etkisizleştirir, tırnak ve yeni satırı korur", () => {
  const csv = csvTable([["=HYPERLINK(1)", 'a"b', "satır\nyeni", "  +SUM(1)"]]);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /a""b/);
  assert.match(csv, /'  \+SUM/);
});

test("ZIP dosya adından üst dizine çıkılamaz", async () => {
  await assert.rejects(async () => { for await (const part of zipEntries([{ name: "../secret", read: async () => new Uint8Array() }])) void part; }, /dosya adı/);
});

const decodeQr = (matrix) => spawnSync("python", ["-c", "import sys,json,cv2,numpy as np; a=np.array(json.load(sys.stdin),dtype=np.uint8); a=np.pad((1-a)*255,4,constant_values=255); a=cv2.resize(a,None,fx=10,fy=10,interpolation=cv2.INTER_NEAREST); s,points,_=cv2.QRCodeDetector().detectAndDecode(a); print(s)"], { input: JSON.stringify(matrix), encoding: "utf8" });

test("QR bağımsız OpenCV okuyucusu ile gerçek bağlantıya çözülür", () => {
  const url = "https://muhur-phi.vercel.app/";
  const matrix = qrMatrix(url).map((row) => row.map(Number));
  const result = decodeQr(matrix);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), url);
  assert.match(qrSvg(url), new RegExp(`viewBox="0 0 ${matrix.length + 8} ${matrix.length + 8}"`));
});

test("ortası maskot için boşaltılmış sahne QR'ı (H seviyesi) hâlâ çözülür", () => {
  const url = "https://muhur-phi.vercel.app/";
  const matrix = qrMatrix(url).map((row) => row.map(Number));
  const { start, side } = qrCenterHole(matrix.length);
  for (let y = start; y < start + side; y++) for (let x = start; x < start + side; x++) matrix[y][x] = 0;
  const result = decodeQr(matrix);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), url);
});

test("QR kapasitesi aşan adres açık hata verir", () => {
  assert.throws(() => qrMatrix("x".repeat(107)), /106/);
  const big = qrMatrix("x".repeat(106));
  assert.ok(big.length >= 21 && big.length === big[0].length);
});

test("vitrin Türkçe arama yapar ve giriş dizisini değiştirmez", () => {
  const items = [{ name: "Işık", team_name: "Çözüm", exhibit_no: 2 }, { name: "Arşiv", team_name: "İz", exhibit_no: 1 }];
  assert.equal(filterGallery(items, "ışık", "no")[0].name, "Işık");
  assert.equal(filterGallery(items, "iz", "name")[0].name, "Arşiv");
  assert.deepEqual(filterGallery(items, "", "no").map(i => i.exhibit_no), [1, 2]);
  assert.deepEqual(items.map(i => i.exhibit_no), [2, 1]);
});
