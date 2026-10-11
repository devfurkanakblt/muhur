import React from "react";
import { useCurrentFrame } from "remotion";
import { pop } from "../anim";
import { Bubble, FadeUp, Kicker, RuleLine, Scene, Words } from "../components/ui";
import { config } from "../config";
import type { AccessoryName } from "../mascot/accessories";
import { Mascot, type Mood } from "../mascot/Mascot";
import { C, F } from "../theme";

/* S6–S8 aynı iskelet: solda "KURAL n / 3" ve büyük başlık, sağda maskot ve aksesuarı. */

type Sub = { at: number; text: React.ReactNode };

const RuleScene: React.FC<{
  dur: number;
  n: number;
  title: string;
  accent?: string[];
  subs: Sub[];
  mascot: { mood: (f: number) => Mood; moodAt?: number; acc: AccessoryName[]; look?: { x: number; y: number } };
  bubble?: { at: number; text: React.ReactNode; width?: number };
  tint?: "indigo" | "night";
  children?: React.ReactNode;
}> = ({ dur, n, title, accent, subs, mascot, bubble, tint = "indigo", children }) => {
  const frame = useCurrentFrame();
  return (
    <Scene dur={dur} tint={tint}>
      {children}
      <div style={{ position: "absolute", left: 120, top: 150, width: 1060, display: "grid", gap: 34 }}>
        <Kicker at={4}>Kural {n} / 3</Kicker>
        <Words text={title} at={12} size={112} accent={accent} />
        <RuleLine at={40} />
        <div style={{ display: "grid", gap: 26 }}>
          {subs.map((s, i) => (
            <FadeUp key={i} at={s.at} style={{ fontFamily: F.display, fontSize: 50, lineHeight: 1.22, color: C.ink2, maxWidth: 1000 }}>
              {s.text}
            </FadeUp>
          ))}
        </div>
      </div>
      <Mascot frame={frame} x={1530} y={1010} size={560} mood={mascot.mood(frame)} moodAt={mascot.moodAt} accessories={mascot.acc} look={mascot.look} enterAt={0} />
      {bubble && (
        <Bubble at={bubble.at} x={1230} y={130} size={46} width={bubble.width ?? 600} tail="br">
          {bubble.text}
        </Bubble>
      )}
    </Scene>
  );
};

const em = (t: string) => <b style={{ color: C.ink, fontWeight: 600 }}>{t}</b>;

export const S06Kod: React.FC<{ dur: number }> = ({ dur }) => (
  <RuleScene
    dur={dur}
    n={1}
    title="Kod, bu 24 saatte burada yazılır"
    accent={["burada"]}
    subs={[
      { at: 70, text: <>Evden hazır proje getirip {em("“dün gece yazdım”")} demek yok.</> },
      { at: 160, text: <>mühür, başlangıçtan önceki commit'leri jüriye işaretler. 👀</> },
    ]}
    mascot={{ mood: () => "merakli", acc: ["buyutec"] }}
    bubble={{ at: 240, text: "Ben her şeyi görürüm. 🔍", width: 520 }}
  />
);

export const S07Depark: React.FC<{ dur: number }> = ({ dur }) => (
  <RuleScene
    dur={dur}
    n={2}
    title="Depark hepimizin"
    accent={["hepimizin"]}
    subs={[
      { at: 60, text: <>Ortak alan = {em("ortak saygı.")}</> },
      { at: 130, text: <>Müzik hoparlörden değil, {em("kulaklıktan.")} 🎧</> },
      { at: 200, text: <>Sesli toplantılarda sesini kıs, yan masa da kod yazıyor.</> },
    ]}
    mascot={{ mood: (f) => (f < 290 ? "mutlu" : "heyecanli"), moodAt: 290, acc: ["kulaklik"] }}
    bubble={{ at: 290, text: "Ekoloji hackathon'unda çöp bırakmak? Olmaz. 😤", width: 640 }}
  />
);

export const S08Gece: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const moon = pop(frame, 6, 16, 80);
  return (
    <RuleScene
      dur={dur}
      n={3}
      title="Gece de buradayız"
      accent={["Gece"]}
      tint="night"
      subs={[
        { at: 60, text: <>24 saat = 1 gece. {em("Konaklama da Depark'ta.")}</> },
        { at: 140, text: <>Uyuyanlar var: ışık, ses, telefonlar sessizde. 🤫</> },
      ]}
      mascot={{ mood: () => "uykulu", acc: ["yastik"] }}
    >
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(1640 190) scale(${moon})`}>
          <circle r={86} fill="#F4EFD8" />
          <circle cx={38} cy={-22} r={78} fill={C.wall} />
        </g>
        {[
          [1350, 120],
          [1480, 300],
          [1780, 360],
          [1250, 260],
          [1840, 120],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={5} fill="#fff" opacity={0.3 + 0.7 * Math.abs(Math.sin(frame / 14 + i * 1.7))} />
        ))}
      </svg>
    </RuleScene>
  );
};

/* S9 · Program (config.program dolunca videoya girer) */

export const S09Program: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const rows = config.program ?? [];
  return (
    <Scene dur={dur}>
      <div style={{ position: "absolute", left: 120, top: 150, width: 1100, display: "grid", gap: 30 }}>
        <Kicker at={4}>Program</Kicker>
        <Words text="24 saatte neler var?" at={12} size={100} dot={false} />
        <div style={{ display: "grid", gap: 18, marginTop: 16 }}>
          {rows.map((r, i) => (
            <FadeUp key={i} at={40 + i * 14} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 30, borderTop: `2px solid ${C.rule}`, paddingTop: 16, fontSize: 46, fontFamily: F.display, color: C.ink }}>
              <span style={{ fontFamily: F.mono, color: C.indigo }}>{r.time}</span>
              <span>{r.text}</span>
            </FadeUp>
          ))}
        </div>
      </div>
      <Mascot frame={frame} x={1560} y={1010} size={520} mood="mutlu" accessories={["pizza"]} enterAt={0} />
    </Scene>
  );
};
