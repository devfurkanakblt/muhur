import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, lin, pop } from "../anim";
import { Bubble, FadeUp, Kicker, Scene, Sfx, Words } from "../components/ui";
import { config, eventDates } from "../config";
import { Mascot } from "../mascot/Mascot";
import { C, F } from "../theme";

/* S1 · Merhaba */

const NEURAL = [
  "M0 760 H330 L400 690 H640",
  "M0 230 H210 L290 310 H520",
  "M1920 170 H1560 L1480 250 H1300",
  "M1920 860 H1540 L1460 780 H1240",
  "M0 520 H120 L170 470 H300",
  "M1920 560 H1760 L1710 610 H1600",
];
const NODES = [
  [640, 690],
  [520, 310],
  [1300, 250],
  [1240, 780],
  [300, 470],
  [1600, 610],
];

export const S01Merhaba: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const named = config.mascotName;
  const mood = frame < 112 ? "heyecanli" : frame < 192 ? "mutlu" : named ? "mutlu" : frame < 266 ? "merakli" : "normal";
  const moodAt = frame < 112 ? undefined : frame < 192 ? 112 : frame < 266 ? 192 : 266;
  // "Beyin benim ama, neyse.": gözler sol üstten tepeye, oradan sağ üste yay çizer (göz devirme).
  const ROLL = 274;
  const roll = (() => {
    if (named || frame < 266) return { x: 0, y: 0 };
    const k = ease(frame, ROLL, 26);
    const th = Math.PI * (1 - k);
    const arc = { x: Math.cos(th) * 40, y: -34 - Math.sin(th) * 22 };
    const into = ease(frame, 266, 8);
    const back = ease(frame, ROLL + 34, 14);
    return { x: arc.x * into * (1 - back), y: arc.y * into * (1 - back) };
  })();
  const rollTilt = named || frame < 266 ? -3 : -3 + 7 * ease(frame, ROLL, 26) * (1 - ease(frame, ROLL + 34, 14));
  return (
    <Scene dur={dur} whoosh={false}>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {NEURAL.map((d, i) => {
          const p = ease(frame, 2 + i * 4, 30);
          return <path key={i} d={d} stroke={C.indigoFill} strokeWidth={5} fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} opacity={0.75} />;
        })}
        {NODES.map(([x, y], i) => {
          const p = pop(frame, 26 + i * 4, 10, 200);
          const glow = 0.6 + 0.4 * Math.sin(frame / 10 + i);
          return <rect key={i} x={x - 14} y={y - 14} width={28} height={28} rx={5} fill={C.mViolet} opacity={glow} transform={`translate(${x} ${y}) scale(${p}) translate(${-x} ${-y})`} />;
        })}
      </svg>
      <Sfx name="whoosh" at={14} volume={0.6} />
      <Mascot
        frame={frame}
        x={900}
        y={1000}
        size={680}
        enterAt={18}
        mood={mood}
        moodAt={moodAt}
        wiggle={frame < 100 ? 5 : 0}
        look={roll}
        tilt={rollTilt}
      />
      <Bubble at={45} until={105} x={1170} y={170} size={78}>
        Selam Depark! 👋
      </Bubble>
      <Bubble at={112} until={185} x={1150} y={190} size={60} width={640}>
        Ben bu hackathon'un <b style={{ color: C.indigoFill }}>beyniyim.</b>
      </Bubble>
      {named ? (
        <Bubble at={192} x={1150} y={190} size={66} width={620}>
          Adım <b style={{ color: C.indigoFill }}>{named}</b>! Memnun oldum.
        </Bubble>
      ) : (
        <>
          <Bubble at={192} until={260} x={1150} y={170} size={54} width={700}>
            Adım mı? …Henüz yok.
            <div style={{ fontWeight: 400, fontSize: "0.72em", color: "#44485f", marginTop: 10 }}>Ekip hâlâ düşünüyor.</div>
          </Bubble>
          <Bubble at={266} x={1150} y={200} size={58} width={600}>
            Beyin benim ama, neyse.
          </Bubble>
        </>
      )}
      <FadeUp at={40} style={{ position: "absolute", left: 96, bottom: 80, fontFamily: F.mono, fontSize: 26, letterSpacing: "0.12em", color: C.ink3 }}>
        DEÜ CS&amp;AI · {config.event.name}
      </FadeUp>
    </Scene>
  );
};

/* S2 · Başlık */

export const Leaf: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 120 120" width={size} height={size}>
    <path d="M20 100 Q14 30 96 18 Q104 92 34 102 Z" fill={C.leaf} stroke={C.mInk} strokeWidth={7} strokeLinejoin="round" />
    <path d="M30 92 Q52 64 84 34" stroke={C.mInk} strokeWidth={6} fill="none" strokeLinecap="round" />
  </svg>
);

export const Chip: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 120 120" width={size} height={size}>
    <g stroke={C.mViolet} strokeWidth={7} strokeLinecap="round">
      {[38, 60, 82].map((v) => (
        <g key={v}>
          <path d={`M${v} 6 V22`} />
          <path d={`M${v} 98 V114`} />
          <path d={`M6 ${v} H22`} />
          <path d={`M98 ${v} H114`} />
        </g>
      ))}
    </g>
    <rect x={22} y={22} width={76} height={76} rx={12} fill={C.mVioletDeep} stroke={C.mInk} strokeWidth={7} />
    <rect x={44} y={44} width={32} height={32} rx={5} fill={C.mViolet} />
  </svg>
);

// 180 px kutularda yaprağın görünen sağ kenarı %83,6 (eğri + kontur); çipin bacak uçları %2, gövdesi %15. Optik denge için %6 alınır.
const PLUS = 56;
const GAP = 46;
const LEAF_LEFT = 960 - PLUS / 2 - GAP - 180 * 0.836;
const CHIP_LEFT = 960 + PLUS / 2 + GAP - 180 * 0.06;

export const S02Baslik: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const meet = ease(frame, 4, 24);
  const merged = frame >= 28;
  const flash = lin(frame, [28, 31, 44], [0, 0.9, 0]);
  const burst = pop(frame, 28, 9, 180);
  return (
    <Scene dur={dur}>
      <div style={{ position: "absolute", left: LEAF_LEFT - (1 - meet) * 700, top: 170, transform: `rotate(${(1 - meet) * -60}deg) scale(${merged ? 1 + (1 - Math.min(burst, 1)) * 0.2 : 1})` }}>
        <Leaf size={180} />
      </div>
      <div style={{ position: "absolute", left: CHIP_LEFT + (1 - meet) * 700, top: 170, transform: `rotate(${(1 - meet) * 60}deg) scale(${merged ? 1 + (1 - Math.min(burst, 1)) * 0.2 : 1})` }}>
        <Chip size={180} />
      </div>
      <svg width={PLUS} height={PLUS} viewBox="-1 -1 2 2" style={{ position: "absolute", left: 960 - PLUS / 2, top: 260 - PLUS / 2, opacity: merged ? 1 : 0, transform: `scale(${burst})` }}>
        <path d="M0 -0.8 V0.8 M-0.8 0 H0.8" stroke={C.ink} strokeWidth={0.32} strokeLinecap="round" />
      </svg>
      <AbsoluteFill style={{ background: `radial-gradient(500px 300px at 960px 260px, rgba(255,255,255,${flash}), transparent 70%)` }} />
      <Sfx name="pop" at={28} />
      <div style={{ position: "absolute", top: 410, width: 1920, textAlign: "center" }}>
        <Words text={config.event.name} at={34} size={200} dot={false} accent={["2026"]} />
      </div>
      <div style={{ position: "absolute", top: 650, width: 1920, display: "flex", justifyContent: "center" }}>
        <Kicker at={58} color={C.ink2} style={{ fontSize: 40, letterSpacing: "0.12em" }}>
          <span style={{ color: C.leaf }}>Ekoloji</span> + <span style={{ color: C.indigo }}>Yapay Zekâ</span>
        </Kicker>
      </div>
      <FadeUp at={80} style={{ position: "absolute", top: 760, width: 1920, textAlign: "center", fontFamily: F.mono, fontSize: 34, color: C.ink2 }}>
        {eventDates}
        <div style={{ marginTop: 14, color: C.ink }}>{config.event.place}</div>
      </FadeUp>
    </Scene>
  );
};
