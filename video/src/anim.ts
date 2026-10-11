import { Easing, interpolate, spring } from "remotion";
import { FPS } from "./theme";

export const s = (sec: number) => Math.round(sec * FPS);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0→1 yaylı giriş; `delay` kare cinsinden. */
export function pop(frame: number, delay = 0, damping = 11, stiffness = 170) {
  return spring({ frame: frame - delay, fps: FPS, config: { damping, stiffness, mass: 0.7 } });
}

/** 0→1 yumuşak geçiş (ease-out). */
export function ease(frame: number, from: number, dur: number) {
  return interpolate(frame, [from, from + dur], [0, 1], { ...clamp, easing: Easing.bezier(0.22, 1, 0.36, 1) });
}

/** 0→1 sitenin cam eğrisi: cubic-bezier(0.77,0,0.175,1). */
export function glass(frame: number, from: number, dur: number) {
  return interpolate(frame, [from, from + dur], [0, 1], { ...clamp, easing: Easing.bezier(0.77, 0, 0.175, 1) });
}

export function lin(frame: number, input: number[], output: number[]) {
  return interpolate(frame, input, output, clamp);
}

/** Sahne çıkışı: son `dur` karede 1→0. */
export function exitFade(frame: number, total: number, dur = 8) {
  return lin(frame, [total - dur, total], [1, 0]);
}

/** Ekran sarsıntısı: `at` karesinden itibaren `dur` kare sönen titreşim. */
export function shake(frame: number, at: number, dur = 10, amp = 14) {
  const t = frame - at;
  if (t < 0 || t > dur) return { x: 0, y: 0 };
  const k = (1 - t / dur) * amp;
  return { x: Math.sin(t * 2.7) * k, y: Math.cos(t * 3.3) * k * 0.6 };
}
