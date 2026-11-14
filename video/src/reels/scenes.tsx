import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, glass, lin, pop } from "../anim";
import { Globe, makeProjection, project, type LonLat } from "../components/globe";
import { LogoRow } from "../components/logos";
import { VB_H, VB_W, VIGNETTES, type VignetteName } from "../components/vignettes";
import { Bubble, Btn, Check, Confetti, FadeUp, Kicker, Sfx, Words } from "../components/ui";
import { config, eventDates } from "../config";
import { Mascot } from "../mascot/Mascot";
import { Chip, Leaf } from "../scenes/intro";
import { C, F } from "../theme";

// Instagram Reels: 1080×1920. Üstte ~250 px (başlık çubuğu), altta ~450 px (açıklama) ve
// sağ altta beğen/yorum sütunu arayüzle örtülür; yazılar bu bantların dışında tutulur.
export const RW = 1080;
export const RH = 1920;
const L = 72;
const TOP = 250;

/* ---------- Zemin ve sahne kabuğu ---------- */

/** Dikey zemin. `leaf` 0→1 indigo ışıktan yeşile geçer; Reels'te tüm sahnelerin altında tek zemin kayar. */
export const ReelBg: React.FC<{ leaf?: number; frame: number; children?: React.ReactNode }> = ({ leaf = 0, frame, children }) => {
  const drift = Math.sin(frame / 90) * 40;
  const glow = (c: string, o: number) => `radial-gradient(900px 1150px at ${820 + drift}px 430px, rgba(${c},${o}), transparent 70%)`;
  return (
    <AbsoluteFill lang="tr" style={{ background: C.wall, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: glow("91,70,230", 0.2), opacity: 1 - leaf }} />
      <AbsoluteFill style={{ background: glow("127,217,154", 0.14), opacity: leaf }} />
      <AbsoluteFill style={{ background: `radial-gradient(760px 700px at ${180 - drift}px 1620px, rgba(254,204,215,0.06), transparent 70%)` }} />
      {children}
    </AbsoluteFill>
  );
};

/** Sahne içeriği alttan kayarak girer, yukarı kayarak çıkar. Zemin sahneye ait değildir. */
const Shell: React.FC<{ dur: number; enter?: boolean; whoosh?: boolean; children: React.ReactNode }> = ({ dur, enter = true, whoosh = true, children }) => {
  const frame = useCurrentFrame();
  const inn = enter ? ease(frame, 0, 10) : 1;
  const out = ease(frame, dur - 9, 9);
  return (
    <AbsoluteFill lang="tr">
      <AbsoluteFill style={{ opacity: Math.min(inn, 1 - out), transform: `translateY(${(1 - inn) * 60 - out * 60}px)` }}>{children}</AbsoluteFill>
      {whoosh && <Sfx name="whoosh" at={0} volume={0.45} />}
    </AbsoluteFill>
  );
};

const center: React.CSSProperties = { position: "absolute", left: 0, width: RW, textAlign: "center" };
const kick = { fontSize: 34 };

/* ---------- R1 · Doğa yardım istiyor ---------- */

type Stop = { v: VignetteName; title: string; place: string; p: LonLat; x: number; y: number; rot: number };

const GX = 540;
const GY = 880;
const GR = 290;
const WIN = { w: 400, bar: 42 };
const WIN_H = WIN.bar + Math.round(((WIN.w - 4) * VB_H) / VB_W) + 4;

// Pencereler kürenin iki yanına çıkartma gibi yapışır; kürenin ortası (problem noktası) açık kalır.
const STOPS: Stop[] = [
  { v: "Yangin", title: "Orman yangını", place: "Muğla", p: [28.4, 37.0], x: 30, y: 560, rot: -3 },
  { v: "Buzul", title: "Eriyen buzullar", place: "Grönland", p: [-42, 72], x: RW - 30 - WIN.w, y: 640, rot: 3 },
  { v: "Musilaj", title: "Müsilaj", place: "Marmara", p: [28.0, 40.7], x: 44, y: 960, rot: 2 },
  { v: "Plastik", title: "Plastik atık", place: "Pasifik", p: [-145, 32], x: RW - 44 - WIN.w, y: 1040, rot: -2 },
];

const T0 = 10;
const STEP = 24;
const at = (i: number) => T0 + i * STEP;
const TURN = 14;
const DOT = 10;
const OPEN = 14;
const PANIC = at(STOPS.length - 1) + OPEN + 14;

const rotFor = (s: Stop): [number, number] => [-s.p[0], -s.p[1] * 0.6];
const START: [number, number] = [-10, -24];

function rotation(frame: number): [number, number] {
  let prev = START;
  for (let i = 0; i < STOPS.length; i++) {
    const target = rotFor(STOPS[i]);
    // En kısa yönden dön.
    const dl = ((((target[0] - prev[0]) % 360) + 540) % 360) - 180;
    const next: [number, number] = [prev[0] + dl, target[1]];
    if (frame < at(i) + TURN || i === STOPS.length - 1) {
      const k = glass(frame, at(i), TURN);
      const r: [number, number] = [prev[0] + (next[0] - prev[0]) * k, prev[1] + (next[1] - prev[1]) * k];
      if (i === STOPS.length - 1) r[0] -= Math.max(0, frame - at(i) - TURN) * 0.08;
      return r;
    }
    prev = next;
  }
  return prev;
}

const ProblemWindow: React.FC<{ s: Stop; frame: number; openAt: number }> = ({ s, frame, openAt }) => {
  if (frame < openAt) return null;
  const p = pop(frame, openAt, 12, 190);
  const Art = VIGNETTES[s.v];
  const fromLeft = s.x < RW / 2;
  return (
    <div
      style={{
        position: "absolute",
        left: s.x,
        top: s.y,
        width: WIN.w,
        height: WIN_H,
        background: C.wall,
        border: `2px solid ${C.rule}`,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
        transformOrigin: fromLeft ? "100% 50%" : "0% 50%",
        transform: `rotate(${s.rot}deg) scale(${0.5 + 0.5 * Math.min(p, 1.04)})`,
        opacity: Math.min(p * 1.6, 1),
      }}
    >
      <div style={{ height: WIN.bar, background: C.plinth, borderBottom: `2px solid ${C.rule}`, display: "flex", alignItems: "center", gap: 9, padding: "0 14px" }}>
        {["#ff6b6b", "#ffcf5c", "#7fd99a"].map((c) => (
          <div key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c, opacity: 0.8 }} />
        ))}
        <div style={{ marginLeft: 8, fontFamily: F.display, fontSize: 24, fontWeight: 600, color: C.ink, whiteSpace: "nowrap" }}>
          {s.title} <span style={{ color: C.ink3, fontWeight: 400 }}>· {s.place}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width={WIN.w - 4} height={WIN_H - WIN.bar - 4} preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
        <Art t={frame - openAt} />
      </svg>
    </div>
  );
};

// İlk kare boş kalmasın: Reels akışta kaydırılırken ilk an görülür; yazı ve küre girişin ortasından başlar.
export const R1Doga: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const rot = rotation(frame);
  const proj = makeProjection(GX, GY, GR, rot);
  const cur = STOPS.reduce((c, _, i) => (frame >= at(i) ? i : c), -1);
  const panic = frame >= PANIC;
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
        {active && <circle r={12 + ring * 32} fill="none" stroke={C.danger} strokeWidth={3} opacity={1 - ring} />}
        <circle r={(active ? 13 : 7) * k} fill={C.danger} stroke={C.paper} strokeWidth={active ? 4 : 2.5} />
      </g>
    );
  });
  return (
    <Shell dur={dur} enter={false} whoosh={false}>
      <div style={{ position: "absolute", left: L, top: TOP - 10, width: RW - 2 * L, display: "grid", gap: 22 }}>
        <Kicker at={-8} color={C.leaf} style={kick}>
          {config.event.name} · Hackathon
        </Kicker>
        <Words text="Doğa yardım istiyor." at={-5} size={124} accent={["Doğa"]} accentColor={C.leaf} />
      </div>
      <Globe cx={GX} cy={GY} r={GR} rotate={rot} scale={Math.min(pop(frame, -5, 12, 120), 1.03)} w={RW} h={RH}>
        {dots}
      </Globe>
      {STOPS.map((s, i) => (
        <ProblemWindow key={s.v} s={s} frame={frame} openAt={at(i) + OPEN} />
      ))}
      {STOPS.map((s, i) => (
        <React.Fragment key={s.v}>
          <Sfx name="pop" at={at(i) + DOT} volume={0.45} />
          <Sfx name="whoosh" at={at(i) + OPEN - 2} volume={0.22} />
        </React.Fragment>
      ))}
      <Mascot frame={frame} x={240} y={1610} size={340} enterAt={0} mood={panic ? "panik" : "merakli"} moodAt={PANIC} look={{ x: 20, y: -30 }} wiggle={panic ? 2.5 : 0} />
      <Bubble at={PANIC + 6} x={420} y={1350} size={40} width={520} tail="l">
        Dünya biraz… zor bir dönemden geçiyor.
      </Bubble>
    </Shell>
  );
};

/* ---------- R2 · EkoZeka 2026 ---------- */

// Yaprağın görünen sağ kenarı kutunun %83,6'sında, çipin gövdesi %6'sında (bkz. S02).
const ICON = 200;
const PLUS = 60;
const GAP = 50;
const LEAF_LEFT = RW / 2 - PLUS / 2 - GAP - ICON * 0.836;
const CHIP_LEFT = RW / 2 + PLUS / 2 + GAP - ICON * 0.06;
const ICON_TOP = 330;

export const R2Baslik: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const meet = ease(frame, 4, 22);
  const merged = frame >= 26;
  const flash = lin(frame, [26, 29, 42], [0, 0.9, 0]);
  const burst = pop(frame, 26, 9, 180);
  const bump = merged ? 1 + (1 - Math.min(burst, 1)) * 0.2 : 1;
  const cy = ICON_TOP + ICON / 2;
  const [year, ...rest] = config.event.name.split(" ").reverse();
  return (
    <Shell dur={dur}>
      <div style={{ position: "absolute", left: LEAF_LEFT - (1 - meet) * 640, top: ICON_TOP, transform: `rotate(${(1 - meet) * -60}deg) scale(${bump})` }}>
        <Leaf size={ICON} />
      </div>
      <div style={{ position: "absolute", left: CHIP_LEFT + (1 - meet) * 640, top: ICON_TOP, transform: `rotate(${(1 - meet) * 60}deg) scale(${bump})` }}>
        <Chip size={ICON} />
      </div>
      <svg width={PLUS} height={PLUS} viewBox="-1 -1 2 2" style={{ position: "absolute", left: RW / 2 - PLUS / 2, top: cy - PLUS / 2, opacity: merged ? 1 : 0, transform: `scale(${burst})` }}>
        <path d="M0 -0.8 V0.8 M-0.8 0 H0.8" stroke={C.ink} strokeWidth={0.32} strokeLinecap="round" />
      </svg>
      <AbsoluteFill style={{ background: `radial-gradient(480px 320px at ${RW / 2}px ${cy}px, rgba(255,255,255,${flash}), transparent 70%)` }} />
      <Sfx name="pop" at={26} />
      <div style={{ ...center, top: 640, display: "grid", gap: 6 }}>
        <Words text={rest.reverse().join(" ")} at={32} size={230} dot={false} tick />
        <Words text={year} at={40} size={230} color={C.indigo} dot={false} />
      </div>
      <div style={{ ...center, top: 1150, display: "flex", justifyContent: "center" }}>
        <Kicker at={56} color={C.ink2} style={{ fontSize: 42, letterSpacing: "0.12em" }}>
          <span style={{ color: C.leaf }}>Ekoloji</span> + <span style={{ color: C.indigo }}>Yapay Zekâ</span>
        </Kicker>
      </div>
      <FadeUp at={72} style={{ ...center, top: 1250, left: 110, width: RW - 220, fontFamily: F.display, fontSize: 48, lineHeight: 1.2, color: C.ink2 }}>
        Bugünün doğa problemlerine <b style={{ color: C.ink, fontWeight: 600 }}>yapay zekâ destekli çözümler.</b>
      </FadeUp>
    </Shell>
  );
};

/* ---------- R3 · 24 saat ---------- */

const FORMAT = ["Yüz yüze, Depark'ta", "Kod bu 24 saatte yazılır", "Gece konaklaması da burada"];

export const R3Format: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  return (
    <Shell dur={dur}>
      <div style={{ position: "absolute", left: L, top: TOP, width: RW - 2 * L, display: "grid", gap: 30 }}>
        <Kicker at={4} style={kick}>
          Format
        </Kicker>
        <Words text="24 saat." at={8} size={220} accent={["24"]} tick />
        <div style={{ display: "grid", gap: 34, marginTop: 20 }}>
          {FORMAT.map((t, i) => {
            const a = 34 + i * 18;
            return (
              <FadeUp key={t} at={a} dist={34} style={{ display: "grid", gridTemplateColumns: "84px 1fr", alignItems: "center" }}>
                <Check at={a + 6} size={56} />
                <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 56, letterSpacing: "-0.02em", color: C.ink }}>{t}</div>
                <Sfx name="tik" at={a + 8} volume={0.6} />
              </FadeUp>
            );
          })}
        </div>
      </div>
      <Mascot frame={frame} x={430} y={1560} size={560} mood={frame < 96 ? "normal" : "heyecanli"} moodAt={96} accessories={["bant", "laptop"]} enterAt={10} />
      <Bubble at={96} x={620} y={1010} size={42} width={360} tail="bl">
        Pijamanı da unutma.
      </Bubble>
    </Shell>
  );
};

/* ---------- R4 · Ne zaman, nerede ---------- */

const CAL_W = 390;

const Calendar: React.FC<{ at: number; day: number; weekday: string; time: string; x: number; tilt: number }> = ({ at, day, weekday, time, x, tilt }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, at, 11, 170);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x,
          top: 360,
          width: CAL_W,
          background: C.plinth,
          border: `2px solid ${C.rule}`,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
          transformOrigin: "50% 0%",
          transform: `translateY(${(1 - Math.min(p, 1)) * -120}px) rotate(${tilt * Math.min(p, 1)}deg)`,
          opacity: Math.min(p * 1.8, 1),
        }}
      >
        <div style={{ background: C.indigoFill, color: "#fff", fontFamily: F.mono, fontWeight: 600, fontSize: 40, letterSpacing: "0.2em", textAlign: "center", padding: "20px 0" }}>{config.event.month.toLocaleUpperCase("tr")}</div>
        <div style={{ textAlign: "center", fontFamily: F.display, fontWeight: 800, fontSize: 250, lineHeight: 1.0, letterSpacing: "-0.04em", color: C.ink, padding: "26px 0 6px" }}>{day}</div>
        <div style={{ textAlign: "center", fontFamily: F.display, fontWeight: 600, fontSize: 44, color: C.ink2 }}>{weekday}</div>
        <div style={{ textAlign: "center", fontFamily: F.mono, fontWeight: 600, fontSize: 48, color: C.indigo, padding: "8px 0 34px" }}>{time}</div>
      </div>
      <Sfx name="pop" at={at} volume={0.7} />
    </>
  );
};

const Pin: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ flex: "none" }}>
    <path d="M12 22 C12 22 4.5 14.6 4.5 9.4 A7.5 7.5 0 0 1 19.5 9.4 C19.5 14.6 12 22 12 22 Z" fill={C.indigoFill} stroke={C.mInk} strokeWidth={1.4} strokeLinejoin="round" />
    <circle cx={12} cy={9.4} r={2.8} fill={C.paper} />
  </svg>
);

export const R4Zaman: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const arrow = ease(frame, 26, 14);
  return (
    <Shell dur={dur}>
      <div style={{ position: "absolute", left: L, top: TOP }}>
        <Kicker at={2} style={kick}>
          Ne zaman, nerede?
        </Kicker>
      </div>
      <Calendar at={6} {...config.event.start} x={70} tilt={-3} />
      <Calendar at={18} {...config.event.end} x={RW - 70 - CAL_W} tilt={3} />
      <svg width={120} height={60} viewBox="0 0 120 60" style={{ position: "absolute", left: RW / 2 - 60, top: 630, opacity: arrow > 0 ? 1 : 0 }}>
        <path d={`M10 30 H${10 + 92 * arrow}`} stroke={C.ink} strokeWidth={9} strokeLinecap="round" />
        {arrow > 0.85 && <path d="M80 12 L104 30 L80 48" stroke={C.ink} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <div style={{ position: "absolute", left: L, top: 1000, width: RW - 2 * L, display: "grid", gap: 8 }}>
        <FadeUp at={40} style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: F.display, fontSize: 50, color: C.ink2 }}>
          <Pin size={64} />
          DEÜ Tınaztepe Kampüsü
        </FadeUp>
        <Words text="Depark." at={48} size={190} tick />
      </div>
      <Mascot frame={frame} x={820} y={1590} size={300} mood={frame < 70 ? "mutlu" : "kirp"} moodAt={70} accessories={["kahve"]} enterAt={34} />
    </Shell>
  );
};

/* ---------- R5 · Ödül ---------- */

export const R5Odul: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  return (
    <Shell dur={dur}>
      <div style={{ ...center, top: TOP, display: "grid", justifyItems: "center", gap: 18 }}>
        <Kicker at={4} color={C.blush} style={kick}>
          Ödül
        </Kicker>
        <Words text="Birinci takımın her üyesine" at={8} size={60} weight={600} color={C.ink2} accent={["her"]} accentColor={C.ink} dot={false} />
        <div style={{ display: "grid", gap: 4, marginTop: 14 }}>
          <Words text="1 yıllık" at={24} size={160} dot={false} />
          <Words text="Claude Pro!" at={30} size={160} accent={["Claude", "Pro!"]} dot={false} />
        </div>
      </div>
      <Confetti at={34} originX={RW / 2} originY={900} count={120} />
      <Sfx name="konfeti" at={34} />
      <Mascot frame={frame} x={RW / 2} y={1520} size={520} mood="mutlu" accessories={["kupa"]} enterAt={16} hop={frame > 56} />
      <Bubble at={92} x={600} y={880} size={40} width={400} tail="bl">
        Evet, takımdaki herkes.
      </Bubble>
    </Shell>
  );
};

/* ---------- R6 · Kayıt çağrısı ---------- */

const ArrowUp: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}>
    <path d="M12 20 V5 M5.5 11 L12 4.5 L18.5 11" stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const R6Kayit: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const btn = pop(frame, 30, 10, 170);
  const nudge = frame > 50 ? -Math.abs(Math.sin((frame - 50) / 6)) * 10 : 0;
  return (
    <Shell dur={dur}>
      <div style={{ position: "absolute", left: L, top: TOP, width: RW - 2 * L, display: "grid", gap: 26 }}>
        <Kicker at={2} color={C.leaf} style={kick}>
          Kayıtlar açık
        </Kicker>
        <Words text="Takımını topla." at={6} size={136} accent={["topla"]} tick />
        <div style={{ marginTop: 24, transform: `scale(${Math.min(btn, 1.06)})`, transformOrigin: "0% 50%", opacity: Math.min(btn * 2, 1) }}>
          <Btn glow={frame > 40} size={54}>
            <span style={{ display: "inline-block", transform: `translateY(${nudge}px)` }}>
              <ArrowUp size={52} />
            </span>
            Kayıt linki bio'da
          </Btn>
        </div>
        <FadeUp at={52} style={{ marginTop: 26, fontFamily: F.mono, fontSize: 40, lineHeight: 1.5, color: C.ink2 }}>
          {eventDates}
          <div style={{ color: C.ink }}>{config.event.place}</div>
        </FadeUp>
        {config.logos.length > 0 && <LogoRow at={64} scale={0.78} gap={52} style={{ marginTop: 44, justifyContent: "flex-start" }} />}
      </div>
      <Sfx name="ding" at={30} volume={0.5} />
      <Mascot frame={frame} x={600} y={1560} size={480} mood={frame < 80 ? "heyecanli" : "mutlu"} moodAt={80} accessories={["megafon"]} enterAt={10} wiggle={frame < 80 ? 3 : 0} hop={frame >= 80} />
      <Bubble at={80} x={580} y={1010} size={44} tail="bl">
        Ben hazırım.
        <br />
        Ya sen?
      </Bubble>
    </Shell>
  );
};
