import { crc32 as nodeCrc32, inflateRawSync } from "node:zlib";

/** Kaynak arşivi için makul sınırlar: GitHub zipball'u bunların çok altında kalır. */
export const ZIP_LIMITS = {
  maxEntries: 60_000,
  maxUncompressedBytes: 1024 * 1024 * 1024,
};

const fail = (detail: string): never => {
  throw new Error(`Geçerli bir ZIP arşivi alınamadı: ${detail}.`);
};

let table: Uint32Array | null = null;
function crc32(bytes: Uint8Array) {
  if (typeof nodeCrc32 === "function") return nodeCrc32(bytes) >>> 0;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * ZIP'in merkezi dizinini ve her girdiyi doğrular: sınırlar, yerel başlık, yol güvenliği, açılabilirlik ve CRC.
 * Hiçbir dosya diske açılmaz; arşivdeki kod çalıştırılmaz.
 */
export function checkZipStructure(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = bytes.byteLength;
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  const u64 = (at: number) => {
    const value = view.getBigUint64(at, true);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail("boyut alanı geçersiz");
    return Number(value);
  };

  let eocd = size - 22;
  const earliest = Math.max(0, eocd - 65535);
  while (eocd >= earliest && u32(eocd) !== 0x06054b50) eocd--;
  if (eocd < earliest || eocd + 22 + u16(eocd + 20) !== size) fail("dosya eksik");
  if (u16(eocd + 4) !== 0 || u16(eocd + 6) !== 0) fail("çok parçalı arşiv desteklenmez");

  let entries = u16(eocd + 10);
  let cdSize = u32(eocd + 12);
  let cdOffset = u32(eocd + 16);
  let cdEnd = eocd;
  if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || u32(locator) !== 0x07064b50) fail("ZIP64 dizini bulunamadı");
    const record = u64(locator + 8);
    if (record + 56 > locator || u32(record) !== 0x06064b50) fail("ZIP64 dizini bozuk");
    entries = u64(record + 32);
    cdSize = u64(record + 40);
    cdOffset = u64(record + 48);
    cdEnd = record;
  }
  if (entries === 0) fail("arşiv boş");
  if (entries > ZIP_LIMITS.maxEntries) fail(`en fazla ${ZIP_LIMITS.maxEntries} dosya olabilir`);
  if (cdOffset + cdSize !== cdEnd) fail("merkezi dizin konumu tutarsız");

  let at = cdOffset;
  let total = 0;
  const spans: [number, number][] = [];
  for (let i = 0; i < entries; i++) {
    if (at + 46 > cdEnd || u32(at) !== 0x02014b50) fail("merkezi dizin kaydı bozuk");
    const flags = u16(at + 8);
    const method = u16(at + 10);
    const crc = u32(at + 16);
    let compressed = u32(at + 20);
    let uncompressed = u32(at + 24);
    const nameLength = u16(at + 28);
    const extraLength = u16(at + 30);
    const commentLength = u16(at + 32);
    let localOffset = u32(at + 42);
    const next = at + 46 + nameLength + extraLength + commentLength;
    if (next > cdEnd) fail("merkezi dizin kaydı taşıyor");
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (compressed === 0xffffffff || uncompressed === 0xffffffff || localOffset === 0xffffffff) {
      let extra = at + 46 + nameLength;
      const extraEnd = extra + extraLength;
      let found = false;
      while (extra + 4 <= extraEnd) {
        const id = u16(extra);
        const length = u16(extra + 2);
        if (id === 0x0001) {
          let field = extra + 4;
          if (uncompressed === 0xffffffff) { uncompressed = u64(field); field += 8; }
          if (compressed === 0xffffffff) { compressed = u64(field); field += 8; }
          if (localOffset === 0xffffffff) { localOffset = u64(field); field += 8; }
          if (field > extra + 4 + length) fail("ZIP64 alanı bozuk");
          found = true;
          break;
        }
        extra += 4 + length;
      }
      if (!found) fail("ZIP64 alanı eksik");
    }
    if (flags & 0x1) fail("şifreli dosya içeriyor");
    if (!name || name.startsWith("/") || /^[a-zA-Z]:/.test(name) || name.split(/[\\/]/).includes("..")) {
      fail("güvensiz dosya yolu içeriyor");
    }
    total += uncompressed;
    if (total > ZIP_LIMITS.maxUncompressedBytes) fail("açılmış boyut sınırı aşıldı");

    if (localOffset + 30 > cdOffset || u32(localOffset) !== 0x04034b50) fail("yerel dosya başlığı bulunamadı");
    const dataStart = localOffset + 30 + u16(localOffset + 26) + u16(localOffset + 28);
    const dataEnd = dataStart + compressed;
    if (dataEnd > cdOffset) fail("dosya verisi taşıyor");
    spans.push([localOffset, dataEnd]);

    const data = bytes.subarray(dataStart, dataEnd);
    let content: Uint8Array;
    if (method === 0) {
      if (compressed !== uncompressed) fail("saklanan dosya boyutu tutarsız");
      content = data;
    } else if (method === 8) {
      try {
        content = inflateRawSync(data, { maxOutputLength: Math.max(uncompressed, 1) });
      } catch {
        return fail(`"${name}" açılamıyor`);
      }
    } else {
      return fail(`desteklenmeyen sıkıştırma yöntemi (${method})`);
    }
    if (content.byteLength !== uncompressed || crc32(content) !== crc) fail(`"${name}" bütünlük kontrolünden geçmedi`);
    at = next;
  }
  if (at !== cdEnd && at !== cdOffset + cdSize) fail("merkezi dizin uzunluğu tutarsız");
  // Aynı veri bölgesini paylaşan girdiler (ZIP bombası tekniği) reddedilir.
  spans.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1]) fail("girdiler üst üste biniyor");
  return { entries, uncompressedBytes: total };
}
