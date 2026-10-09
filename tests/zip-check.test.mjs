import test from "node:test";
import assert from "node:assert/strict";
import { crc32, deflateRawSync } from "node:zlib";
import { validateArchive } from "../lib/delivery-core.ts";

/** Küçük ZIP üretici: deflate/store, isteğe bağlı bozma kancalarıyla. */
function buildZip(files, { duplicateFirst = false } = {}) {
  const locals = [];
  const central = [];
  let offset = 0;
  const records = [];
  for (const file of files) {
    const name = Buffer.from(file.name);
    const raw = Buffer.from(file.data);
    const method = file.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(method, 8);
    header.writeUInt32LE(file.crc ?? crc32(raw), 14); header.writeUInt32LE(body.length, 18); header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(name.length, 26);
    locals.push(header, name, body);
    records.push({ name, method, crc: file.crc ?? crc32(raw), csize: body.length, usize: raw.length, offset });
    offset += 30 + name.length + body.length;
  }
  if (duplicateFirst) records.push({ ...records[0], name: Buffer.from("kopya.txt") });
  for (const r of records) {
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(r.method, 10);
    record.writeUInt32LE(r.crc, 16); record.writeUInt32LE(r.csize, 20); record.writeUInt32LE(r.usize, 24);
    record.writeUInt16LE(r.name.length, 28); record.writeUInt32LE(r.offset, 42);
    central.push(record, r.name);
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(records.length, 8); end.writeUInt16LE(records.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

const files = [
  { name: "proje-abc123/", data: "", method: 0 },
  { name: "proje-abc123/README.md", data: "# Proje\n".repeat(200) },
  { name: "proje-abc123/src/index.ts", data: "export const ok = true;\n" },
];

test("A11: geçerli deflate ve store girdileri kabul edilir", () => {
  assert.deepEqual(validateArchive(buildZip(files)), { entries: 3, uncompressedBytes: 1624 });
});

test("A11: merkezi dizini olmayan 52 baytlık dosya reddedilir", () => {
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  assert.throws(() => validateArchive(new Uint8Array(Buffer.concat([local, end]))), /ZIP/);
});

test("A11: CRC uyuşmazlığı ve açılamayan veri reddedilir", () => {
  assert.throws(() => validateArchive(buildZip([{ name: "a.txt", data: "merhaba", crc: 1234 }])), /bütünlük/);
  const zip = buildZip([{ name: "a.txt", data: "merhaba dünya ".repeat(40) }]);
  zip[35] ^= 0xff;
  assert.throws(() => validateArchive(zip), /açılamıyor|bütünlük/);
});

test("A11: üst dizine çıkan yollar ve üst üste binen girdiler reddedilir", () => {
  assert.throws(() => validateArchive(buildZip([{ name: "../kacis.txt", data: "x" }])), /güvensiz/);
  assert.throws(() => validateArchive(buildZip([{ name: "C:/kacis.txt", data: "x" }])), /güvensiz/);
  assert.throws(() => validateArchive(buildZip(files, { duplicateFirst: true })), /üst üste/);
});

test("A11: merkezi dizin konumu tutarsızsa reddedilir", () => {
  const zip = buildZip(files);
  const view = new DataView(zip.buffer);
  view.setUint32(zip.length - 6, view.getUint32(zip.length - 6, true) - 1, true);
  assert.throws(() => validateArchive(zip), /tutarsız/);
});
