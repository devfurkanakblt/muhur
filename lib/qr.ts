import QRCode from "qrcode";

export { qrCenterHole } from "./qr-hole";

/** Site kök adresleri için üst sınır (H seviyesinde sürüm 10'a sığar). */
export const QR_MAX_BYTES = 106;

/**
 * QR modül matrisi. Varsayılan hata düzeltme seviyesi H (%30): ortasına maskot konabilsin diye.
 * Kodlama, yaygın ve test edilmiş `qrcode` paketiyle yapılır.
 */
export function qrMatrix(text: string, level: "L" | "M" | "Q" | "H" = "H"): boolean[][] {
  if (new TextEncoder().encode(text).length > QR_MAX_BYTES) throw new Error(`QR bağlantısı en fazla ${QR_MAX_BYTES} bayt olabilir.`);
  const { modules } = QRCode.create(text, { errorCorrectionLevel: level });
  return Array.from({ length: modules.size }, (_, y) => Array.from({ length: modules.size }, (_, x) => !!modules.get(y, x)));
}

/** Sade SVG (API için): açık zemin, koyu modüller, 4 modül sessiz alan. */
export function qrSvg(text: string) {
  const matrix = qrMatrix(text);
  const n = matrix.length + 8;
  const cells: string[] = [];
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) cells.push(`M${x + 4},${y + 4}h1v1h-1z`); }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#eef2f6"/><path d="${cells.join("")}" fill="#0b0d1e"/></svg>`;
}
