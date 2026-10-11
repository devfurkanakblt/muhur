import React from "react";
import { random } from "remotion";

/* S3 pencerelerindeki küçük döngüsel çizimler. Hepsi 420×240 viewBox, `t` pencere açıldıktan sonraki kare. */

export const VB_W = 420;
export const VB_H = 240;

const SEA = "#2a5fa8";
const SEA_DEEP = "#1d4680";
const FOAM = "rgba(255,255,255,0.55)";
const PINE = "#245a3c";
const PINE_HI = "#2f7a4f";
const TRUNK = "#6b4a2e";
const SAND = "#c9a36b";
const SAND_DARK = "#8f6c3f";
const ICE = "#e4f4ff";
const ICE_SHADE = "#a9d3ef";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function Waves({ t, y, color = FOAM, amp = 5, speed = 1 }: { t: number; y: number; color?: string; amp?: number; speed?: number }) {
  let d = "";
  for (let x = -20; x <= VB_W + 20; x += 10) {
    const yy = y + Math.sin(x / 26 + (t * speed) / 9) * amp;
    d += `${x === -20 ? "M" : "L"}${x} ${yy.toFixed(1)} `;
  }
  return <path d={d} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />;
}

function Pine({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-5} y={-14} width={10} height={16} fill={TRUNK} />
      <path d="M0 -92 L28 -40 L16 -40 L36 -12 L-36 -12 L-16 -40 L-28 -40 Z" fill={PINE} />
      <path d="M0 -92 L28 -40 L16 -40 L36 -12 L0 -12 Z" fill={PINE_HI} />
    </g>
  );
}

function Flame({ x, y, s, t, seed }: { x: number; y: number; s: number; t: number; seed: number }) {
  const k = 1 + Math.sin(t / 2.3 + seed * 3) * 0.14 + Math.sin(t / 1.3 + seed) * 0.06;
  const sway = Math.sin(t / 3.1 + seed * 2) * 4;
  return (
    <g transform={`translate(${x} ${y}) scale(${s}, ${s * k})`}>
      <path d={`M0 0 C-26 -4 -30 -34 -12 -54 C-10 -40 -2 -40 0 -46 C${4 + sway} -66 ${16 + sway} -78 ${10 + sway} -98 C34 -76 36 -30 22 -8 C16 -2 8 0 0 0 Z`} fill="#ff7a3d" />
      <path d={`M2 -2 C-12 -6 -14 -26 -2 -40 C2 -30 6 -32 8 -38 C${12 + sway / 2} -50 ${18 + sway / 2} -56 ${16 + sway / 2} -66 C28 -50 26 -18 16 -6 C12 -3 6 -2 2 -2 Z`} fill="#ffcf5c" />
    </g>
  );
}

/* 1 · Orman yangını */
export const Yangin: React.FC<{ t: number }> = ({ t }) => {
  const trees = [
    { x: 60, y: 206, s: 0.9 },
    { x: 140, y: 214, s: 1.15 },
    { x: 228, y: 208, s: 0.95 },
    { x: 310, y: 216, s: 1.2 },
    { x: 384, y: 206, s: 0.85 },
  ];
  return (
    <>
      <defs>
        <linearGradient id="v-fire-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1430" />
          <stop offset="100%" stopColor="#5a2234" />
        </linearGradient>
      </defs>
      <rect width={VB_W} height={VB_H} fill="url(#v-fire-sky)" />
      {Array.from({ length: 7 }).map((_, i) => {
        const cyc = ((t + i * 17) % 70) / 70;
        return <circle key={i} cx={40 + i * 56 + Math.sin(cyc * 6 + i) * 10} cy={150 - cyc * 140} r={18 + cyc * 26} fill="#3b3346" opacity={0.75 * (1 - cyc)} />;
      })}
      <path d={`M0 214 Q110 196 210 210 T420 204 V${VB_H} H0 Z`} fill="#2a1d22" />
      {trees.map((tr, i) => (
        <React.Fragment key={i}>
          <Pine x={tr.x} y={tr.y} s={tr.s} />
          <Flame x={tr.x - 4} y={tr.y - 10} s={tr.s * 0.95} t={t} seed={i} />
        </React.Fragment>
      ))}
      {Array.from({ length: 10 }).map((_, i) => {
        const cyc = ((t * 1.3 + i * 11) % 50) / 50;
        const x = 30 + random(`e${i}`) * 360 + Math.sin(cyc * 8 + i) * 8;
        return <circle key={i} cx={x} cy={190 - cyc * 170} r={2.6} fill="#ffcf5c" opacity={1 - cyc} />;
      })}
    </>
  );
};

/* 2 · Kuruyan göl */
const CRACKS = [
  "M70 150 L102 160 L118 148 L150 164",
  "M102 160 L96 190 L120 206",
  "M270 152 L300 166 L330 156 L352 172",
  "M300 166 L296 198 L322 210",
  "M150 196 L186 206 L214 198 L250 210 L276 200",
  "M60 196 L84 214",
  "M350 196 L372 212",
];

export const Gol: React.FC<{ t: number }> = ({ t }) => {
  const dry = clamp01(t / 150);
  const rx = 168 - dry * 112;
  const ry = 46 - dry * 28;
  return (
    <>
      <rect width={VB_W} height={VB_H} fill="#f2c27a" />
      <rect y={0} width={VB_W} height={96} fill="#f7d79c" />
      <circle cx={352} cy={44} r={24 + Math.sin(t / 8) * 2} fill="#fff1c9" />
      <circle cx={352} cy={44} r={36} fill="#fff1c9" opacity={0.25} />
      <path d="M0 96 Q120 88 210 96 T420 94 V240 H0 Z" fill={SAND} />
      <ellipse cx={210} cy={176} rx={176} ry={52} fill={SAND_DARK} opacity={0.25} />
      {CRACKS.map((d, i) => {
        const p = clamp01(dry * 1.6 - i * 0.08);
        return <path key={i} d={d} fill="none" stroke={SAND_DARK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />;
      })}
      <ellipse cx={210} cy={176} rx={rx} ry={ry} fill={SEA} />
      <ellipse cx={210} cy={170} rx={rx * 0.7} ry={ry * 0.35} fill="rgba(255,255,255,0.18)" />
      <g transform="translate(64 140)" stroke={TRUNK} strokeWidth={6} strokeLinecap="round" fill="none">
        <path d="M0 0 V-52 M0 -30 L-16 -44 M0 -40 L14 -58" />
      </g>
    </>
  );
};

/* 3 · Müsilaj */
const BLOBS = [
  { x: 90, y: 120, r: 34 },
  { x: 168, y: 140, r: 42 },
  { x: 250, y: 118, r: 36 },
  { x: 320, y: 146, r: 40 },
  { x: 130, y: 182, r: 30 },
  { x: 220, y: 188, r: 38 },
  { x: 300, y: 196, r: 28 },
  { x: 380, y: 118, r: 26 },
  { x: 40, y: 170, r: 26 },
];

export const Musilaj: React.FC<{ t: number }> = ({ t }) => (
  <>
    <rect width={VB_W} height={VB_H} fill={SEA_DEEP} />
    <rect width={VB_W} height={78} fill="#33427a" />
    <path d="M0 78 Q60 58 130 70 T260 66 T420 72 V82 H0 Z" fill="#2b3566" />
    <Waves t={t} y={86} />
    {BLOBS.map((b, i) => {
      const g = clamp01((t - i * 9) / 40);
      const wob = 1 + Math.sin(t / 10 + i) * 0.05;
      return (
        <g key={i} transform={`translate(${b.x + Math.sin(t / 22 + i) * 4} ${b.y})`}>
          <ellipse rx={b.r * g * wob * 1.3} ry={b.r * g * 0.55} fill="#d8cc9a" opacity={0.92} />
          <ellipse rx={b.r * g * 0.7} ry={b.r * g * 0.22} cy={-b.r * g * 0.12} fill="#efe6bd" opacity={0.85} />
        </g>
      );
    })}
    <Waves t={t} y={214} color="rgba(255,255,255,0.25)" amp={4} speed={0.8} />
  </>
);

/* 4 · Eriyen buzullar */
export const Buzul: React.FC<{ t: number }> = ({ t }) => {
  const c = clamp01((t - 30) / 60);
  const drop = c * c;
  const drips = Array.from({ length: 5 }).map((_, i) => {
    const cyc = ((t + i * 13) % 40) / 40;
    return <circle key={i} cx={96 + i * 46} cy={150 + cyc * 40} r={4} fill={ICE_SHADE} opacity={1 - cyc} />;
  });
  return (
    <>
      <rect width={VB_W} height={VB_H} fill="#cfe8f7" />
      <circle cx={70} cy={50} r={26} fill="#fff6d8" />
      <rect y={150} width={VB_W} height={90} fill={SEA} />
      <path d="M40 150 L64 74 L104 96 L140 40 L196 84 L232 62 L270 150 Z" fill={ICE} />
      <path d="M140 40 L196 84 L232 62 L270 150 L180 150 Z" fill={ICE_SHADE} opacity={0.6} />
      <g transform={`translate(${286 + drop * 30} ${70 + drop * 92}) rotate(${drop * 38})`}>
        <path d="M-14 0 L22 -20 L52 4 L48 80 L-10 80 Z" fill={ICE} />
        <path d="M22 -20 L52 4 L48 80 L20 80 Z" fill={ICE_SHADE} opacity={0.6} />
      </g>
      {drips}
      <rect y={160} width={VB_W} height={80} fill={SEA} />
      {drop > 0.85 && <circle cx={330} cy={162} r={10 + (t % 30) * 1.4} fill="none" stroke={FOAM} strokeWidth={3} opacity={1 - (t % 30) / 30} />}
      <Waves t={t} y={162} />
      <Waves t={t} y={204} color="rgba(255,255,255,0.3)" amp={4} speed={0.7} />
    </>
  );
};

/* 5 · Ormansızlaşma */
export const Orman: React.FC<{ t: number }> = ({ t }) => {
  const trees = Array.from({ length: 10 }).map((_, i) => ({ x: 30 + (i % 5) * 90 + (i >= 5 ? 45 : 0), y: i >= 5 ? 214 : 160, i }));
  const order = [2, 7, 4, 0, 9, 5, 3, 8, 1, 6];
  return (
    <>
      <rect width={VB_W} height={VB_H} fill="#bfe3c9" />
      <path d="M0 132 Q140 112 260 128 T420 122 V240 H0 Z" fill="#8bbf6e" />
      <path d="M0 190 Q120 176 220 190 T420 186 V240 H0 Z" fill="#76ab5c" />
      {trees.map((tr) => {
        const k = 1 - clamp01((t - 10 - order.indexOf(tr.i) * 12) / 8);
        return (
          <g key={tr.i} transform={`translate(${tr.x} ${tr.y})`}>
            <rect x={-7} y={-12} width={14} height={14} fill={TRUNK} />
            <ellipse cx={0} cy={-12} rx={7} ry={3} fill="#c8a173" />
            <g transform={`translate(0 -12) scale(${k}) translate(0 12)`} opacity={k}>
              <rect x={-6} y={-40} width={12} height={30} fill={TRUNK} />
              <circle cx={0} cy={-58} r={30} fill="#2f7a4f" />
              <circle cx={-12} cy={-66} r={14} fill="#3e9462" />
            </g>
          </g>
        );
      })}
    </>
  );
};

/* 6 · Plastik atık */
const JUNK = [
  { kind: "bottle", x: 70, y: 112, rot: -20 },
  { kind: "bag", x: 160, y: 132, rot: 0 },
  { kind: "can", x: 236, y: 110, rot: 30 },
  { kind: "bottle", x: 320, y: 140, rot: 70 },
  { kind: "bag", x: 380, y: 106, rot: 0 },
  { kind: "can", x: 110, y: 176, rot: -60 },
  { kind: "bottle", x: 214, y: 190, rot: 15 },
  { kind: "bag", x: 300, y: 196, rot: 0 },
] as const;

export const Plastik: React.FC<{ t: number }> = ({ t }) => (
  <>
    <rect width={VB_W} height={VB_H} fill={SEA_DEEP} />
    <rect width={VB_W} height={84} fill="#9fd0f0" />
    <Waves t={t} y={88} />
    {JUNK.map((j, i) => {
      const bob = Math.sin(t / 9 + i * 1.4) * 5;
      const rot = j.rot + Math.sin(t / 14 + i) * 8;
      return (
        <g key={i} transform={`translate(${j.x} ${j.y + bob}) rotate(${rot})`}>
          {j.kind === "bottle" && (
            <>
              <rect x={-11} y={-26} width={22} height={46} rx={8} fill="#8fd3e8" opacity={0.85} />
              <rect x={-6} y={-36} width={12} height={12} rx={2} fill="#e2554f" />
              <rect x={-11} y={-6} width={22} height={12} fill="#f7f1d6" />
            </>
          )}
          {j.kind === "can" && (
            <>
              <rect x={-12} y={-18} width={24} height={36} rx={4} fill="#d9dde8" />
              <rect x={-12} y={-6} width={24} height={14} fill="#e2554f" />
            </>
          )}
          {j.kind === "bag" && <path d="M-22 -16 L-14 -24 L-8 -14 L8 -14 L14 -24 L22 -16 L18 22 Q0 30 -18 22 Z" fill="#f4f6fb" opacity={0.72} />}
        </g>
      );
    })}
    <Waves t={t} y={222} color="rgba(255,255,255,0.25)" amp={4} speed={0.8} />
  </>
);

export const VIGNETTES = { Yangin, Gol, Musilaj, Buzul, Orman, Plastik } as const;
export type VignetteName = keyof typeof VIGNETTES;

