import React from "react";
import { useCurrentFrame } from "remotion";
import { ease, glass, lin, pop } from "../anim";
import { Globe, makeProjection, project, type LonLat } from "../components/globe";
import { VB_H, VB_W, VIGNETTES, type VignetteName } from "../components/vignettes";
import { Bubble, Check, FadeUp, Kicker, Scene, Sfx, Words } from "../components/ui";
import { Mascot } from "../mascot/Mascot";
import { C, F } from "../theme";

/* S3 · Doğa yardım istiyor: küre her probleme döner, noktadan kenara çizgi uzanır, pencere açılır. */

const GX = 960;
const GY = 460;
const GR = 300;
const WIN = { w: 440, h: 280, bar: 46, lx: 56, rx: 1424, ys: [60, 400, 740] };

type Stop = { v: VignetteName; title: string; place: string; p: LonLat; side: -1 | 1; row: number };

// Türkiye ve dünya sırayla: art arda yakın noktalara dönmek küreyi gereksiz oynatıyordu.
const STOPS: Stop[] = [
  { v: "Yangin", title: "Orman yangını", place: "Muğla", p: [28.4, 37.0], side: -1, row: 0 },
  { v: "Buzul", title: "Eriyen buzullar", place: "Grönland", p: [-42, 72], side: 1, row: 0 },
  { v: "Gol", title: "Kuruyan göl", place: "Tuz Gölü", p: [33.4, 38.8], side: -1, row: 1 },
  { v: "Orman", title: "Ormansızlaşma", place: "Amazon", p: [-62, -5], side: 1, row: 1 },
  { v: "Musilaj", title: "Müsilaj", place: "Marmara", p: [28.0, 40.7], side: -1, row: 2 },
  { v: "Plastik", title: "Plastik atık", place: "Pasifik", p: [-145, 32], side: 1, row: 2 },
];

const T0 = 26;
const STEP = 50;
const at = (i: number) => T0 + i * STEP;
const TURN = 26;
const DOT = 22;
const LINE = 26;
const OPEN = 34;
const PANIC = at(STOPS.length - 1) + 40;

// Nokta pencerenin bulunduğu tarafta görünsün diye küre merkezi noktanın 28° yanına çevrilir.
const rotFor = (s: Stop): [number, number] => [-(s.p[0] - s.side * 28), -s.p[1] * 0.6];
const START: [number, number] = [0, -24];

function rotation(frame: number): [number, number] {
  if (frame < T0) {
    const k = lin(frame, [0, T0], [0, 1]);
    return [START[0] - 12 * k, START[1]];
  }
  let prev: [number, number] = [START[0] - 12, START[1]];
  for (let i = 0; i < STOPS.length; i++) {
    const target = rotFor(STOPS[i]);
    // En kısa yönden dön: boylam farkını -180..180 aralığına indir.
    const dl = ((((target[0] - prev[0]) % 360) + 540) % 360) - 180;
    const next: [number, number] = [prev[0] + dl, target[1]];
    if (frame < at(i) + TURN || i === STOPS.length - 1) {
      const k = glass(frame, at(i), TURN);
      const r: [number, number] = [prev[0] + (next[0] - prev[0]) * k, prev[1] + (next[1] - prev[1]) * k];
      if (i === STOPS.length - 1) r[0] -= Math.max(0, frame - at(i) - TURN) * 0.06;
      return r;
    }
    prev = next;
  }
  return prev;
}

const anchor = (s: Stop): [number, number] => [s.side < 0 ? WIN.lx + WIN.w : WIN.rx, WIN.ys[s.row] + WIN.h / 2];

const Pencere: React.FC<{ s: Stop; frame: number }> = ({ s, frame }) => {
  const o = at(STOPS.indexOf(s)) + OPEN;
  if (frame < o) return null;
  const p = pop(frame, o, 13, 170);
  const Art = VIGNETTES[s.v];
  return (
    <div
      style={{
        position: "absolute",
        left: s.side < 0 ? WIN.lx : WIN.rx,
        top: WIN.ys[s.row],
        width: WIN.w,
        height: WIN.h,
        background: C.wall,
        border: `2px solid ${C.rule}`,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
        transformOrigin: s.side < 0 ? "100% 50%" : "0% 50%",
        transform: `scale(${0.55 + 0.45 * Math.min(p, 1.04)})`,
        opacity: Math.min(p * 1.6, 1),
      }}
    >
      <div style={{ height: WIN.bar, background: C.plinth, borderBottom: `2px solid ${C.rule}`, display: "flex", alignItems: "center", gap: 10, padding: "0 16px" }}>
        {["#ff6b6b", "#ffcf5c", "#7fd99a"].map((c) => (
          <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.8 }} />
        ))}
        <div style={{ marginLeft: 10, fontFamily: F.display, fontSize: 25, fontWeight: 600, color: C.ink, whiteSpace: "nowrap" }}>
          {s.title} <span style={{ color: C.ink3, fontWeight: 400 }}>· {s.place}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width={WIN.w - 4} height={WIN.h - WIN.bar - 4} preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
        <Art t={frame - o} />
      </svg>
    </div>
  );
};

export const S03Doga: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const rot = rotation(frame);
  const proj = makeProjection(GX, GY, GR, rot);
  const cur = STOPS.reduce((c, _, i) => (frame >= at(i) ? i : c), -1);
  const panic = frame >= PANIC;
  const globeIn = pop(frame, 0, 12, 120);

  const dots = STOPS.map((s, i) => {
    const d = at(i) + DOT;
    if (frame < d) return null;
    const xy = project(proj, s.p);
    if (!xy) return null;
    const active = i === cur;
    const k = pop(frame, d, 9, 260);
    const ring = ((frame - d) % 30) / 30;
    return (
      <g key={s.v} transform={`translate(${xy[0]} ${xy[1]})`}>
        {active && <circle r={12 + ring * 30} fill="none" stroke={C.danger} strokeWidth={3} opacity={1 - ring} />}
        <circle r={(active ? 12 : 7) * k} fill={C.danger} stroke={C.paper} strokeWidth={active ? 4 : 2.5} />
      </g>
    );
  });

  const lines = STOPS.map((s, i) => {
    const l = at(i) + LINE;
    if (frame < l) return null;
    const grow = ease(frame, l, 12);
    const fade = 1 - ease(frame, i === STOPS.length - 1 ? PANIC : at(i + 1), 8);
    if (fade <= 0) return null;
    const xy = project(proj, s.p);
    if (!xy) return null;
    const [ax, ay] = anchor(s);
    return (
      <g key={s.v} opacity={fade}>
        <line x1={xy[0]} y1={xy[1]} x2={xy[0] + (ax - xy[0]) * grow} y2={xy[1] + (ay - xy[1]) * grow} stroke={C.danger} strokeWidth={3} strokeDasharray="10 8" strokeLinecap="round" />
        {grow > 0.98 && <circle cx={ax} cy={ay} r={7} fill={C.danger} />}
      </g>
    );
  });

  const side = cur >= 0 && !panic ? STOPS[cur].side : 0;
  return (
    <Scene dur={dur} tint="leaf">
      <Globe cx={GX} cy={GY} r={GR} rotate={rot} scale={Math.min(globeIn, 1.03)}>
        {dots}
      </Globe>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {lines}
      </svg>
      {STOPS.map((s) => (
        <Pencere key={s.v} s={s} frame={frame} />
      ))}
      {STOPS.map((s, i) => (
        <React.Fragment key={s.v}>
          <Sfx name="pop" at={at(i) + DOT} volume={0.45} />
          <Sfx name="whoosh" at={at(i) + OPEN - 2} volume={0.22} />
        </React.Fragment>
      ))}
      <Mascot frame={frame} x={760} y={1075} size={330} enterAt={8} mood={panic ? "panik" : "merakli"} moodAt={PANIC} look={{ x: side * 30, y: -26 }} wiggle={panic ? 2.5 : 0} />
      <Bubble at={PANIC + 10} x={962} y={850} size={42} width={400} tail="l">
        Dünya biraz… zor bir dönemden geçiyor.
      </Bubble>
    </Scene>
  );
};

/* S4 · Görev */

export const S04Gorev: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const chips = ["Kod", "Model", "Prototip", "24 saat"];
  return (
    <Scene dur={dur} tint="leaf">
      <div style={{ position: "absolute", left: 120, top: 170, width: 1080, display: "grid", gap: 40 }}>
        <Kicker at={6} color={C.leaf}>Senin görevin</Kicker>
        <Words text="Bugünün doğa problemlerinden birini seç," at={18} size={86} accent={["doğa", "problemlerinden"]} accentColor={C.leaf} dot={false} />
        <Words text="ona yapay zekâ destekli bir çözüm üret." at={90} size={86} accent={["yapay", "zekâ", "destekli"]} />
        <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
          {chips.map((c, i) => (
            <FadeUp key={c} at={170 + i * 7} style={{ fontFamily: F.mono, fontSize: 34, color: C.ink, border: `2px solid ${C.rule}`, background: C.plinth, padding: "14px 26px", borderRadius: 3 }}>
              {c}
            </FadeUp>
          ))}
        </div>
      </div>
      <Mascot frame={frame} x={1540} y={1000} size={600} mood={frame < 90 ? "normal" : "heyecanli"} moodAt={90} accessories={frame >= 12 ? ["bant", "laptop"] : []} enterAt={2} />
    </Scene>
  );
};

/* S5 · Beklediklerimiz */

const EXPECT = ["Gerçek bir doğa problemi", "Yapay zekâ çözümün kalbinde olsun, süs değil", "Bu 24 saatte yazılmış kod, public GitHub reposunda"];

export const S05Beklenen: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  return (
    <Scene dur={dur} tint="leaf">
      <div style={{ position: "absolute", left: 120, top: 190, width: 1080, display: "grid", gap: 72 }}>
        <Kicker at={4} color={C.leaf}>EkoZeka · Bizden beklenen</Kicker>
        {EXPECT.map((t, i) => {
          const at = 20 + i * 50;
          return (
            <FadeUp key={t} at={at} dist={40} style={{ display: "grid", gridTemplateColumns: "84px 1fr", alignItems: "center" }}>
              <Check at={at + 8} size={58} />
              <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 68, lineHeight: 1.08, letterSpacing: "-0.02em", color: C.ink }}>{t}</div>
              <Sfx name="tik" at={at + 10} volume={0.6} />
            </FadeUp>
          );
        })}
      </div>
      <Mascot frame={frame} x={1560} y={1010} size={540} mood={frame < 190 ? "normal" : "kirp"} moodAt={190} accessories={["bant", "laptop"]} />
      <Bubble at={190} x={1220} y={150} size={46} width={600} tail="br">
        "Chatbot'a yaprak emojisi koydum" saymıyoruz. 🌿🤖
      </Bubble>
    </Scene>
  );
};
