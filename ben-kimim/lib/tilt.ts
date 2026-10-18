/**
 * Ekranın baktığı yön: +1 tavan, 0 dik (alında), −1 yer.
 * Cihazın z ekseninin dünya düşeyindeki bileşeni cos(β)·cos(γ)'dır; telefon dikey ya da yatay tutulsa da aynı kalır.
 */
export function screenFacing(beta: number, gamma: number): number {
  const rad = Math.PI / 180;
  return Math.cos(beta * rad) * Math.cos(gamma * rad);
}

export type Tilt = "dogru" | "pas";

/** Eşik aşılınca bir kez tetiklenir; telefon yeniden dik konuma gelmeden ikinci hareket sayılmaz. */
export function createTiltReader(trigger = 0.55, neutral = 0.3) {
  let armed = false;
  return (facing: number): Tilt | null => {
    if (Math.abs(facing) < neutral) {
      armed = true;
      return null;
    }
    if (!armed || Math.abs(facing) < trigger) return null;
    armed = false;
    return facing < 0 ? "dogru" : "pas";
  };
}
