import React from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { pop } from "../anim";
import { Qr } from "../components/qr";
import { Bubble, FadeUp, Kicker, Notice, Scene, Words } from "../components/ui";
import { config } from "../config";
import { Mascot } from "../mascot/Mascot";
import { C, F } from "../theme";

/* S20 · Telegram */

export const S20Telegram: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const qrIn = pop(frame, 30, 12, 160);
  const breathe = 1 + Math.sin(frame / 12) * 0.012;
  const short = config.telegramUrl.replace(/^https:\/\//, "");
  return (
    <Scene dur={dur}>
      <div style={{ position: "absolute", left: 110, top: 110, width: 860, display: "grid", gap: 30 }}>
        <Kicker at={2}>Duyurular</Kicker>
        <Words text="Hepsi Telegram kanalımızda" at={8} size={92} accent={["Telegram"]} />
      </div>
      <Notice at={70} index={0} x={110} y={470} text="Yemek geldi! 🍕" width={780} />
      <Notice at={105} index={1} x={150} y={610} text="Son 1 saat! Teslimini güncelle." width={780} />
      <Notice at={140} index={2} x={190} y={750} text="Teslim kilitlendi. 🔏" width={780} />
      <div style={{ position: "absolute", left: 1050, top: 130, width: 520, background: C.paper, padding: 34, borderRadius: 4, display: "grid", gap: 18, transform: `scale(${Math.min(qrIn, 1.04) * breathe})`, boxShadow: "0 30px 70px rgba(0,0,0,0.45)" }}>
        <Qr text={config.telegramUrl} size={452} />
        <div style={{ fontFamily: F.mono, fontSize: 25, color: C.deep, textAlign: "center" }}>{short}</div>
      </div>
      <Mascot frame={frame} x={1730} y={1050} size={340} mood={frame < 356 ? "heyecanli" : "mutlu"} moodAt={356} accessories={["telefon"]} enterAt={0} />
      <Bubble at={180} until={262} x={980} y={780} size={42} width={620} tail="br">
        Kaçırırsan pizza gider, mentor saati gider… 🍕💨
      </Bubble>
      <Bubble at={268} until={350} x={930} y={760} size={40} width={680} tail="br">
        Teslimini güncellemeyi unutursan <b style={{ color: C.indigoFill }}>mühür de buradan dürter:</b> son 60 ve 15 dakika. 🔔
      </Bubble>
      <Bubble at={356} x={980} y={790} size={44} width={620} tail="br">
        <b>Şimdi katıl.</b> Evet, şimdi. QR tam karşında. 📱
      </Bubble>
    </Scene>
  );
};

/* S21 · Özet */

const RECAP = [
  { i: "🌍", t: <>Doğa problemi + yapay zekâ</> },
  { i: "⌨️", t: <>Kod burada, 24 saatte</> },
  { i: "🔏", t: <>Push → <b style={{ color: C.indigo }}>Teslim sürümünü güncelle</b></> },
  { i: "📣", t: <><b style={{ color: C.indigo }}>Telegram kanalına</b> katıl</> },
];

export const S21Ozet: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const go = 236;
  return (
    <Scene dur={dur}>
      <div style={{ position: "absolute", left: 110, top: 140, display: "grid", gap: 52, opacity: frame < go ? 1 : Math.max(0, 1 - (frame - go) / 10) }}>
        <Kicker at={2}>Özetle</Kicker>
        {RECAP.map((r, i) => (
          <FadeUp key={i} at={12 + i * 22} dist={36} style={{ display: "flex", alignItems: "center", gap: 34, fontFamily: F.display, fontWeight: 600, fontSize: 76, letterSpacing: "-0.02em", color: C.ink }}>
            <span style={{ width: 124, height: 124, borderRadius: 3, background: C.plinth, border: `2px solid ${C.rule}`, display: "grid", placeItems: "center", fontSize: 68 }}>{r.i}</span>
            <span>{r.t}</span>
          </FadeUp>
        ))}
      </div>
      {frame >= go && (
        <div style={{ position: "absolute", left: 110, top: 220, width: 1200, display: "grid", gap: 40 }}>
          <Words text="Düşün, Bağlan, Üret." at={go + 4} size={84} weight={600} color={C.ink2} dot={false} />
          <Words text="Hazırsan… saat başlasın!" at={go + 30} size={140} accent={["başlasın!"]} dot={false} />
        </div>
      )}
      <Mascot frame={frame} x={1680} y={1040} size={440} mood={frame < go ? "normal" : "heyecanli"} moodAt={go} accessories={["bant", "laptop"]} enterAt={0} hop={frame > go + 30} />
      <Bubble at={150} until={go - 4} x={1310} y={560} size={44} width={520} tail="br">
        Bu dördü yeter. Gerisi senin fikrin. 💡
      </Bubble>
    </Scene>
  );
};

/* S22 · Bitiş */

export const S22Bitis: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  return (
    <Scene dur={dur} whoosh={false}>
      <div style={{ position: "absolute", top: config.sponsors.length ? 200 : 290, width: 1920, display: "flex", justifyContent: "center", alignItems: "center", gap: 90 }}>
        <FadeUp at={4} style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <div style={{ position: "relative", width: 230, height: 190 }}>
            <Mascot frame={frame} x={115} y={190} size={230} mood="mutlu" />
          </div>
          <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: 76, letterSpacing: "-0.03em", color: C.ink }}>DEÜ CS&amp;AI</span>
        </FadeUp>
        <FadeUp at={14} style={{ width: 2, height: 160, background: C.rule }}>
          {null}
        </FadeUp>
        <FadeUp at={20} style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <Img src={staticFile("brand/muhur-logo.svg")} style={{ width: 150, height: 150 }} />
          <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: 100, letterSpacing: "-0.04em", color: C.ink }}>
            mühür<span style={{ color: C.indigo }}>.</span>
          </span>
        </FadeUp>
      </div>
      <FadeUp at={34} style={{ position: "absolute", top: config.sponsors.length ? 480 : 600, width: 1920, textAlign: "center", fontFamily: F.mono, fontSize: 32, letterSpacing: "0.12em", color: C.ink3 }}>
        {config.event.name.toLocaleUpperCase("tr")} · DÜŞÜN, BAĞLAN, ÜRET.
      </FadeUp>
      {config.sponsors.length > 0 && (
        <FadeUp at={44} style={{ position: "absolute", top: 640, width: 1920, display: "grid", justifyItems: "center", gap: 30 }}>
          <span style={{ fontFamily: F.display, fontSize: 22, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink3 }}>Destekleyenler</span>
          <div style={{ display: "flex", gap: 70, alignItems: "center" }}>
            {config.sponsors.map((s) => (
              <Img key={s} src={staticFile(`sponsorlar/${s}`)} style={{ height: 110, maxWidth: 320, objectFit: "contain" }} />
            ))}
          </div>
        </FadeUp>
      )}
    </Scene>
  );
};
