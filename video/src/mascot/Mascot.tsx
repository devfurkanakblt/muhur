import React from "react";
import { BODY_FILL, BODY_INK, CIRCUIT_LINES } from "../../../components/mascot/paths";
import { pop } from "../anim";
import { C } from "../theme";
import { Accessory, type AccessoryName } from "./accessories";

// Gövde sitedeki maskotla aynı vektörden gelir (components/mascot/paths.ts).
// Yüz geometrisi components/mascot/mascot.tsx'ten alındı; video için göz kırpma,
// bakış yönü ve yeni ifadeler (panik, şaşkın, göz kırpma) eklendi.

export type Mood =
  | "normal"
  | "mutlu"
  | "merakli"
  | "uykulu"
  | "heyecanli"
  | "panik"
  | "sasirmis"
  | "kirp"
  | "konusan";

const INK = C.mInk;
const EYE_L = { cx: 528.5, cy: 658, w: 71, h: 130 };
const EYE_R = { cx: 769, cy: 657.5, w: 68, h: 129 };
const STROKE = { stroke: INK, strokeWidth: 20, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

function OpenEyes({ look, scaleY = 1, big = false }: { look: { x: number; y: number }; scaleY?: number; big?: boolean }) {
  const k = big ? 1.22 : 1;
  return (
    <g fill={INK} transform={`translate(${look.x} ${look.y})`}>
      {[EYE_L, EYE_R].map((e) => {
        const w = e.w * k;
        const h = e.h * k * scaleY;
        return <rect key={e.cx} x={e.cx - w / 2} y={e.cy - h / 2} width={w} height={Math.max(h, 14)} rx={Math.min(w, Math.max(h, 14)) / 2} />;
      })}
      {big && (
        <g fill="#fff">
          <circle cx={EYE_L.cx - 12} cy={EYE_L.cy - 30} r={13} />
          <circle cx={EYE_R.cx - 12} cy={EYE_R.cy - 30} r={13} />
        </g>
      )}
    </g>
  );
}

function Eyes({ mood, blink, look }: { mood: Mood; blink: number; look: { x: number; y: number } }) {
  switch (mood) {
    case "mutlu":
      return (
        <g {...STROKE} strokeWidth={22}>
          <path d="M490 676 Q528 600 566 676" />
          <path d="M731 676 Q769 600 807 676" />
        </g>
      );
    case "uykulu":
      return (
        <g {...STROKE}>
          <path d="M492 650 Q528 700 564 650" />
          <path d="M733 650 Q769 700 805 650" />
        </g>
      );
    case "heyecanli":
    case "panik":
      return (
        <g {...STROKE} strokeWidth={24}>
          <path d="M494 612 L566 656 L494 700" />
          <path d="M805 612 L733 656 L805 700" />
        </g>
      );
    case "kirp":
      return (
        <g>
          <path d="M490 676 Q528 600 566 676" {...STROKE} strokeWidth={22} />
          <rect x={EYE_R.cx - EYE_R.w / 2} y={EYE_R.cy - EYE_R.h / 2} width={EYE_R.w} height={EYE_R.h} rx={EYE_R.w / 2} fill={INK} />
        </g>
      );
    case "sasirmis":
      return <OpenEyes look={look} big scaleY={1 - blink * 0.9} />;
    default:
      return <OpenEyes look={look} scaleY={1 - blink * 0.9} />;
  }
}

function Mouth({ mood, talk }: { mood: Mood; talk: number }) {
  switch (mood) {
    case "heyecanli":
      return <path d="M626 752 Q649 790 672 752" {...STROKE} strokeWidth={18} />;
    case "mutlu":
    case "kirp":
      return <path d="M604 752 Q649 812 694 752" {...STROKE} strokeWidth={20} />;
    case "panik":
      return <path d="M600 790 Q616 770 632 790 Q649 810 666 790 Q682 770 698 790" {...STROKE} strokeWidth={16} />;
    case "sasirmis":
      return <ellipse cx={649} cy={790} rx={26} ry={34} fill={INK} />;
    case "konusan":
      return <ellipse cx={649} cy={782} rx={30} ry={8 + talk * 22} fill={INK} />;
    default:
      return <path d="M618 760 Q649 800 680 760" {...STROKE} strokeWidth={18} />;
  }
}

function Extras({ mood, frame }: { mood: Mood; frame: number }) {
  switch (mood) {
    case "merakli":
      return (
        <g transform={`rotate(${Math.sin(frame / 9) * 6} 222 300)`}>
          <path d="M150 196 Q150 120 222 120 Q292 120 292 186 Q292 230 246 252 Q222 264 222 300" {...STROKE} strokeWidth={30} />
          <circle cx={222} cy={352} r={20} fill={INK} />
        </g>
      );
    case "uykulu": {
      const f = (frame % 60) / 60;
      return (
        <g {...STROKE} strokeWidth={22} opacity={0.4 + 0.6 * Math.abs(Math.sin(frame / 20))} transform={`translate(${f * 10} ${-f * 20})`}>
          <path d="M90 250 H150 L90 314 H150" />
          <path d="M190 128 H270 L190 214 H270" />
        </g>
      );
    }
    case "heyecanli":
    case "kirp":
      return (
        <g stroke={C.mViolet} strokeWidth={32} strokeLinecap="round" opacity={0.6 + 0.4 * Math.sin(frame / 4)}>
          <path d="M166 186 L214 270" />
          <path d="M52 312 L142 350" />
        </g>
      );
    case "panik": {
      const d = (frame % 24) / 24;
      return (
        <g>
          {[
            { x: 300, y: 430, s: 1 },
            { x: 1000, y: 380, s: 0.8 },
          ].map((p, i) => (
            <path
              key={i}
              transform={`translate(${p.x} ${p.y + ((d + i * 0.5) % 1) * 60}) scale(${p.s})`}
              d="M0 -70 Q44 -10 44 22 Q44 62 0 62 Q-44 62 -44 22 Q-44 -10 0 -70 Z"
              fill="#BFE3FF"
              stroke={INK}
              strokeWidth={14}
              opacity={1 - ((d + i * 0.5) % 1) * 0.6}
            />
          ))}
        </g>
      );
    }
    default:
      return null;
  }
}

export type MascotProps = {
  frame: number;
  mood?: Mood;
  accessories?: AccessoryName[];
  /** Ekrandaki alt-orta nokta (px). */
  x: number;
  y: number;
  /** Genişlik (px). */
  size: number;
  /** Bu karede alttan zıplayarak girer. undefined: zaten sahnede. */
  enterAt?: number;
  tilt?: number;
  /** Sağa sola sallanma genliği (derece). */
  wiggle?: number;
  /** Yerinde zıplama. */
  hop?: boolean;
  look?: { x: number; y: number };
  /** Gözlük düşüşü 0→1 (gozluk aksesuarı için). */
  glassesDrop?: number;
  /** Ağız hareketi için konuşma kareleri. */
  talking?: boolean;
  /** İfade değişince küçük bir esneme vuruşu için ifadenin başladığı kare. */
  moodAt?: number;
  flip?: boolean;
  outline?: boolean;
};

export const Mascot: React.FC<MascotProps> = ({
  frame,
  mood = "normal",
  accessories = [],
  x,
  y,
  size,
  enterAt,
  tilt = 0,
  wiggle = 0,
  hop = false,
  look = { x: 0, y: 0 },
  glassesDrop = 1,
  talking = false,
  moodAt,
  flip = false,
  outline = true,
}) => {
  const enter = enterAt === undefined ? 1 : pop(frame, enterAt, 9, 120);
  const air = 1 - enter;
  const ty = air * 620 - (hop ? Math.abs(Math.sin(frame / 7)) * 34 : 0);
  // Havadayken uzar, inişte (yay taşması) basılır.
  let sy = 1 + air * 0.22;
  if (enter > 1) sy = 1 - (enter - 1) * 1.4;
  if (moodAt !== undefined && frame >= moodAt && frame < moodAt + 10) {
    sy *= 1 - Math.sin(((frame - moodAt) / 10) * Math.PI) * 0.07;
  }
  const breathe = Math.sin(frame / 15) * 0.014;
  sy += breathe;
  const sx = 1 / Math.sqrt(sy);
  const rot = tilt + wiggle * Math.sin(frame / 5);

  // Her ~3,4 sn'de bir 4 karelik göz kırpma.
  const cyc = (frame + Math.round(x)) % 102;
  const blink = cyc < 4 ? Math.sin((cyc / 4) * Math.PI) : 0;
  const talk = talking ? Math.abs(Math.sin(frame / 2.6)) : 0;
  const m: Mood = talking && (mood === "normal" || mood === "merakli") ? "konusan" : mood;

  const sw = size * 0.008;
  const filter = outline
    ? `drop-shadow(${sw}px 0 0 #fff) drop-shadow(${-sw}px 0 0 #fff) drop-shadow(0 ${sw}px 0 #fff) drop-shadow(0 ${-sw}px 0 #fff) drop-shadow(0 ${size * 0.03}px ${size * 0.03}px rgba(0,0,0,0.35))`
    : undefined;
  const h = (size * 1070) / 1310;

  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - h,
        width: size,
        height: h,
        transformOrigin: "50% 100%",
        transform: `translateY(${ty}px) rotate(${rot}deg) scale(${(flip ? -1 : 1) * sx}, ${sy})`,
        filter,
      }}
    >
      <svg viewBox="20 70 1310 1070" width={size} height={h} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <clipPath id="mascot-head">
            <path d={BODY_FILL} />
          </clipPath>
          {/* Gövde vektörünün viewBox dışında kalan kırpıntısını gizle; aksesuarlar taşabilir. */}
          <clipPath id="body-crop">
            <rect x={20} y={70} width={1310} height={1070} />
          </clipPath>
        </defs>
        <g clipPath="url(#body-crop)">
        <path d={BODY_FILL} fill={C.mFill} />
        <g fill={C.mBlush}>
          <ellipse cx={425.5} cy={741} rx={51} ry={36} />
          <ellipse cx={861} cy={742} rx={53} ry={38} />
        </g>
        <path d={BODY_INK} fill={INK} />
        <path d={CIRCUIT_LINES} fill={C.mViolet} />
        {[
          [1058, 225, 133, 135],
          [1190, 428, 125, 129],
        ].map(([sx0, sy0, w, hh]) => (
          <g key={sx0}>
            <rect x={sx0} y={sy0} width={w} height={hh} rx={18} fill={C.mVioletDeep} />
            <rect x={sx0 + w * 0.31} y={sy0 + hh * 0.31} width={w * 0.38} height={hh * 0.38} rx={6} fill={C.mViolet} />
          </g>
        ))}
        <rect x={1034} y={916} width={26} height={26} rx={4} fill={C.mViolet} />
        </g>
        {accessories.includes("bant") && <Accessory name="bant" frame={frame} />}
        <Eyes mood={m} blink={blink} look={look} />
        <Mouth mood={m} talk={talk} />
        <Extras mood={m} frame={frame} />
        {accessories
          .filter((a) => a !== "bant")
          .map((a) => (
            <Accessory key={a} name={a} frame={frame} drop={glassesDrop} blink={blink} />
          ))}
      </svg>
    </div>
  );
};
