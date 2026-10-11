import React from "react";
import { useCurrentFrame } from "remotion";
import { pop } from "../anim";
import { Bubble, Check, FadeUp, Kicker, Scene, Sfx, Words } from "../components/ui";
import { Mascot } from "../mascot/Mascot";
import { C, F } from "../theme";

/* S3 · Doğa yardım istiyor */

const PROBLEMS = [
  { e: "🔥", t: "Orman yangınları", x: 330, y: 230 },
  { e: "🏜️", t: "Kuraklık", x: 600, y: 120 },
  { e: "💧", t: "Su kirliliği", x: 1320, y: 120 },
  { e: "🏭", t: "Hava kirliliği", x: 1590, y: 230 },
  { e: "🗑️", t: "Atık", x: 260, y: 470 },
  { e: "🐝", t: "Yok olan türler", x: 1660, y: 470 },
];

export const S03Doga: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const panic = frame >= 70;
  return (
    <Scene dur={dur} tint="leaf">
      {PROBLEMS.map((p, i) => {
        const at = 8 + i * 8;
        const s = pop(frame, at, 10, 200);
        const bob = Math.sin(frame / 12 + i) * 8;
        return (
          <React.Fragment key={p.t}>
            <div style={{ position: "absolute", left: p.x - 150, top: p.y + bob, width: 300, display: "grid", justifyItems: "center", gap: 14, transform: `scale(${s})` }}>
              <div style={{ width: 150, height: 150, borderRadius: 75, background: C.plinth, border: `3px solid ${C.rule}`, display: "grid", placeItems: "center", fontSize: 84 }}>{p.e}</div>
              <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 32, color: C.ink2 }}>{p.t}</div>
            </div>
            <Sfx name="pop" at={at} volume={0.4} />
          </React.Fragment>
        );
      })}
      <Mascot frame={frame} x={960} y={1040} size={560} mood={panic ? "panik" : "normal"} moodAt={70} look={{ x: Math.sin(frame / 8) * 30, y: -20 }} wiggle={panic ? 2.5 : 0} />
      <Bubble at={84} x={1160} y={800} size={50} width={620} tail="l">
        Dünya biraz… zor bir dönemden geçiyor. 🥵
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
