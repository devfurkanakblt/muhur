/** ZIP STORE: içindeki ZIP'leri tekrar sıkıştırmadan, tek dosya bellekte tutarak aktarır. */
export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipEntry = { name: string; read: () => Promise<Uint8Array> };
const encoder = new TextEncoder();

export async function* zipEntries(entries: ZipEntry[]) {
  const central: Uint8Array[] = [];
  let offset = 0;
  if (entries.length > 65535) throw new Error("ZIP dosya sayısı sınırı aşıldı.");
  for (const entry of entries) {
    if (entry.name.includes("..") || entry.name.startsWith("/") || entry.name.includes("\\")) throw new Error("Geçersiz ZIP dosya adı.");
    const name = encoder.encode(entry.name);
    const bytes = await entry.read();
    const crc = crc32(bytes);
    if (offset + bytes.length + name.length + 30 > 0xffffffff) throw new Error("ZIP boyut sınırı aşıldı.");
    const header = new Uint8Array(30 + name.length);
    const local = new DataView(header.buffer);
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x800, true);
    local.setUint16(12, 0x21, true); // DOS tarihi: 1980-01-01, kararlı çıktı.
    local.setUint32(14, crc, true); local.setUint32(18, bytes.length, true); local.setUint32(22, bytes.length, true);
    local.setUint16(26, name.length, true); header.set(name, 30);
    const record = new Uint8Array(46 + name.length);
    const directory = new DataView(record.buffer);
    directory.setUint32(0, 0x02014b50, true); directory.setUint16(4, 20, true); directory.setUint16(6, 20, true);
    directory.setUint16(8, 0x800, true); directory.setUint16(14, 0x21, true);
    directory.setUint32(16, crc, true); directory.setUint32(20, bytes.length, true); directory.setUint32(24, bytes.length, true);
    directory.setUint16(28, name.length, true); directory.setUint32(42, offset, true); record.set(name, 46);
    central.push(record);
    offset += header.length + bytes.length;
    yield header;
    yield bytes;
  }
  let directoryBytes = 0;
  for (const record of central) { directoryBytes += record.length; yield record; }
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, entries.length, true); view.setUint16(10, entries.length, true);
  view.setUint32(12, directoryBytes, true); view.setUint32(16, offset, true);
  yield end;
}

export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvTable(rows: unknown[][]) {
  return "\uFEFF" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");
}
