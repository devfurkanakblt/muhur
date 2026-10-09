/**
 * Sahne karekodunun ortasında maskot için boşaltılan kare: kenarın ~%36'sı (alanın ~%13'ü).
 * H seviyesinin %30 onarım payının altında; testler %40'a kadar çözümlemeyi doğruluyor.
 */
export function qrCenterHole(size: number) {
  let side = Math.round(size * 0.36);
  if (side % 2 === 0) side += 1;
  return { start: (size - side) / 2, side };
}
