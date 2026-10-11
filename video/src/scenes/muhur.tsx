import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { ease, glass, lin, pop, shake } from "../anim";
import { Qr } from "../components/qr";
import { Browser, Btn, Bubble, Cursor, FadeUp, Field, Kicker, Scene, Sfx, Words } from "../components/ui";
import { config } from "../config";
import { Mascot } from "../mascot/Mascot";
import { C, F } from "../theme";

// Arayüz sitenin koyu temasıyla yeniden çizildi; ekip, repo ve SHA'lar örnektir.

const Wordmark: React.FC<{ size: number }> = ({ size }) => (
  <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: size, letterSpacing: "-0.04em", color: C.ink }}>
    mühür<span style={{ color: C.indigo }}>.</span>
  </span>
);

const Example: React.FC = () => (
  <div style={{ position: "absolute", right: 20, top: 16, fontFamily: F.mono, fontSize: 18, letterSpacing: "0.12em", color: C.ink3, border: `1px solid ${C.rule}`, padding: "4px 10px", borderRadius: 2 }}>ÖRNEK</div>
);

const StepHead: React.FC<{ n: number; title: string; accent?: string[] }> = ({ n, title, accent }) => (
  <div style={{ display: "grid", gap: 26 }}>
    <Kicker at={4}>Adım {n} / 4</Kicker>
    <Words text={title} at={10} size={74} accent={accent} dot={false} />
  </div>
);

/* S11 · Tanışma */

export const S11Tanisma: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const slam = 100;
  const p = frame < slam ? 0 : lin(frame, [slam - 1, slam + 8], [0, 1]);
  const scale = 2.6 - 1.6 * p;
  const sh = shake(frame, slam + 8, 12, 18);
  return (
    <Scene dur={dur}>
      <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
        <div style={{ position: "absolute", left: 120, top: 130, width: 1700 }}>
          <Words text="Peki projeni nasıl teslim edeceksin?" at={6} size={84} weight={600} color={C.ink2} dot={false} accent={["teslim"]} accentColor={C.ink} />
        </div>
        {frame >= slam && (
          <div style={{ position: "absolute", left: 760, top: 380, display: "flex", alignItems: "center", gap: 50, transform: `scale(${scale})`, transformOrigin: "30% 50%", opacity: p }}>
            <Img src={staticFile("brand/muhur-logo.svg")} style={{ width: 230, height: 230 }} />
            <Wordmark size={210} />
          </div>
        )}
        <FadeUp at={slam + 30} style={{ position: "absolute", left: 770, top: 680, fontFamily: F.display, fontSize: 60, fontStyle: "italic", color: C.ink2 }}>
          Süre dolar, mühür vurulur.
        </FadeUp>
      </AbsoluteFill>
      <Sfx name="tak" at={slam + 8} />
      <Mascot frame={frame} x={380} y={1030} size={460} mood={frame < slam + 8 ? "normal" : frame < 150 ? "sasirmis" : "mutlu"} moodAt={frame < 150 ? slam + 8 : 150} talking={frame > 40 && frame < 96} enterAt={0} />
      <Bubble at={40} until={96} x={520} y={420} size={50} tail="bl">
        Tanıştırayım…
      </Bubble>
    </Scene>
  );
};

/* S12 · Giriş */

export const S12Giris: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const clicked = frame >= 130;
  return (
    <Scene dur={dur}>
      <div style={{ position: "absolute", left: 110, top: 130, width: 720, display: "grid", gap: 40 }}>
        <StepHead n={1} title="GitHub ile giriş yap" accent={["GitHub"]} />
        <FadeUp at={40} style={{ fontFamily: F.mono, fontSize: 44, color: C.indigo }}>
          {config.siteUrl}
        </FadeUp>
        <FadeUp at={56} style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ background: C.paper, padding: 18, borderRadius: 3 }}>
            <Qr text={`https://${config.siteUrl}`} size={230} />
          </div>
          <div style={{ fontFamily: F.display, fontSize: 32, color: C.ink3, lineHeight: 1.3 }}>
            Telefonla
            <br />
            okutabilirsin.
          </div>
        </FadeUp>
      </div>
      <Browser url={config.siteUrl} x={900} y={150} w={920} h={680} at={14}>
        <div style={{ position: "absolute", left: 50, top: 40, right: 50, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Wordmark size={46} />
          <span style={{ fontFamily: F.display, fontSize: 26, color: C.ink3 }}>Sergi · Doğrula</span>
        </div>
        <div style={{ position: "absolute", left: 50, top: 150, display: "grid", gap: 18 }}>
          <span style={{ fontFamily: F.display, fontSize: 20, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink3 }}>{config.event.name} · başlangıca</span>
          <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 110, letterSpacing: "-0.03em", color: C.ink, fontVariantNumeric: "tabular-nums" }}>
            00<span style={{ color: C.indigo }}>:</span>05<span style={{ color: C.indigo }}>:</span>
            {String(59 - (Math.floor(frame / 30) % 60)).padStart(2, "0")}
          </span>
        </div>
        <div style={{ position: "absolute", left: 50, top: 400 }}>
          <Btn pressed={frame >= 130 && frame < 136} glow={frame > 70 && !clicked} size={36}>
            <svg viewBox="0 0 16 16" width={36} height={36}>
              <path
                fill="#fff"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
            GitHub ile giriş yap
          </Btn>
        </div>
        {clicked && (
          <FadeUp at={140} style={{ position: "absolute", left: 50, top: 530, fontFamily: F.display, fontSize: 30, color: C.leaf }}>
            ✓ Giriş yapıldı: @ekip-yesil
          </FadeUp>
        )}
      </Browser>
      <Cursor
        path={[
          { at: 60, x: 1700, y: 900 },
          { at: 110, x: 1362, y: 676 },
        ]}
        clickAt={[130]}
      />
    </Scene>
  );
};

/* S13 · Repo */

const REPOS = [
  { name: "ekip-yesil/orman-gozu", pub: true },
  { name: "ekip-yesil/gizli-deneme", pub: false },
  { name: "ekip-yesil/damla", pub: true },
];

export const S13Repo: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const hoverPrivate = frame >= 70 && frame < 120;
  const selected = frame >= 140;
  const imported = frame >= 186;
  return (
    <Scene dur={dur}>
      <div style={{ position: "absolute", left: 110, top: 130, width: 740, display: "grid", gap: 40 }}>
        <StepHead n={2} title="Reponu seç, içe aktar" accent={["Reponu"]} />
        <FadeUp at={80} style={{ fontFamily: F.display, fontSize: 50, lineHeight: 1.2, color: C.ink2 }}>
          Repo <b style={{ color: C.blush }}>public</b> olmalı.
          <div style={{ fontSize: 36, color: C.ink3, marginTop: 12 }}>Private repo kabul edilmez.</div>
        </FadeUp>
      </div>
      <Browser url={`${config.siteUrl}/panel`} x={900} y={150} w={920} h={720} at={10}>
        <Example />
        <div style={{ position: "absolute", left: 44, right: 44, top: 44, display: "grid", gap: 18 }}>
          <div style={{ fontFamily: F.display, fontSize: 20, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink3 }}>Repo ara</div>
          <div style={{ border: `2px solid ${C.rule}`, background: C.plinth, padding: "14px 18px", fontFamily: F.mono, fontSize: 26, color: C.ink3, borderRadius: 3 }}>ekip-yesil/</div>
          {REPOS.map((r, i) => {
            const hot = (i === 1 && hoverPrivate) || (i === 0 && selected);
            return (
              <FadeUp key={r.name} at={24 + i * 6} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 22px", border: `2px solid ${hot ? (r.pub ? C.indigo : C.danger) : C.rule}`, borderRadius: 3, background: i === 0 && selected ? "rgba(91,70,230,0.16)" : "transparent" }}>
                <span style={{ fontFamily: F.mono, fontSize: 28, color: C.ink }}>{r.name}</span>
                <span style={{ fontFamily: F.display, fontSize: 22, letterSpacing: "0.08em", textTransform: "uppercase", color: r.pub ? C.leaf : C.danger }}>{r.pub ? "public" : "private"}</span>
              </FadeUp>
            );
          })}
          <div style={{ height: 40, fontFamily: F.display, fontSize: 28, color: C.danger, opacity: hoverPrivate ? 1 : 0 }}>✕ Repo public olmalı.</div>
          <div>
            <Btn pressed={frame >= 186 && frame < 192} glow={selected && !imported} disabled={!selected} size={32}>
              GitHub ile içe aktar
            </Btn>
          </div>
        </div>
      </Browser>
      <Cursor
        path={[
          { at: 40, x: 1700, y: 950 },
          { at: 70, x: 1500, y: 470 },
          { at: 125, x: 1500, y: 470 },
          { at: 140, x: 1400, y: 370 },
          { at: 170, x: 1272, y: 790 },
        ]}
        clickAt={[140, 186]}
      />
      {hoverPrivate && <Sfx name="tik" at={70} volume={0.4} />}
    </Scene>
  );
};

/* S14 · Dört alan */

export const S14Form: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const t = (a: number, d: number) => ease(frame, a, d);
  const logo = pop(frame, 150, 11, 200);
  const saved = frame >= 206;
  const stamp = frame < 214 ? 0 : lin(frame, [214, 222], [0, 1]);
  return (
    <Scene dur={dur}>
      <div style={{ position: "absolute", left: 110, top: 130, width: 740, display: "grid", gap: 40 }}>
        <StepHead n={3} title="4 alanı doldur" accent={["4"]} />
        <FadeUp at={60} style={{ fontFamily: F.display, fontSize: 50, color: C.ink2 }}>
          Bir dakika bile sürmez.
        </FadeUp>
      </div>
      <Browser url={`${config.siteUrl}/panel`} x={900} y={110} w={920} h={860} at={6}>
        <Example />
        <div style={{ position: "absolute", left: 44, right: 44, top: 40, display: "grid", gap: 20 }}>
          <Field label="Proje adı" value="Orman Gözü" progress={t(30, 22)} />
          <Field label="Ekip adı" value="Ekip Yeşil" progress={t(60, 20)} />
          <Field label="Kısa özet" value="Uydu görüntülerinden orman yangını riskini tahmin eden model." progress={t(88, 50)} height={110} />
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ width: 110, height: 110, border: `2px dashed ${C.rule}`, borderRadius: 3, display: "grid", placeItems: "center", background: C.plinth }}>
              <div style={{ transform: `scale(${logo})`, width: 70, height: 70, borderRadius: 3, background: C.leaf, display: "grid", placeItems: "center", fontSize: 44 }}>🌲</div>
            </div>
            <div style={{ fontFamily: F.display, fontSize: 20, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink3 }}>Logo</div>
          </div>
          <div>
            <Btn pressed={frame >= 206 && frame < 212} glow={frame > 170 && !saved} size={30}>
              Projeyi kaydet ve vitrine yerleştir
            </Btn>
          </div>
        </div>
        {stamp > 0 && (
          <div style={{ position: "absolute", right: 90, top: 650, transform: `rotate(-12deg) scale(${2.2 - 1.2 * stamp})`, opacity: stamp, border: `6px solid ${C.blush}`, color: C.blush, fontFamily: F.mono, fontWeight: 600, fontSize: 54, padding: "14px 26px", borderRadius: 6 }}>
            No. 001
          </div>
        )}
      </Browser>
      <Sfx name="pop" at={150} volume={0.5} />
      <Sfx name="tak" at={222} volume={0.6} />
      <Cursor
        path={[
          { at: 160, x: 1700, y: 1000 },
          { at: 196, x: 1440, y: 815 },
        ]}
        clickAt={[206]}
      />
      <Mascot frame={frame} x={420} y={1040} size={380} mood={frame < 222 ? "normal" : "mutlu"} moodAt={222} enterAt={0} hop={frame > 222} />
      <Bubble at={230} x={560} y={560} size={44} tail="bl">
        Vitrindesin! ✨
      </Bubble>
    </Scene>
  );
};

/* S15 · Takım */

export const S15Takim: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const copied = frame >= 66;
  const people = [
    { l: "A", c: C.leaf },
    { l: "D", c: C.blush },
    { l: "E", c: C.indigo },
  ];
  return (
    <Scene dur={dur}>
      <div style={{ position: "absolute", left: 110, top: 130, width: 760, display: "grid", gap: 40 }}>
        <StepHead n={4} title="Takımını davet et" accent={["davet"]} />
        <FadeUp at={40} style={{ fontFamily: F.display, fontSize: 46, color: C.ink2, lineHeight: 1.25 }}>
          Takım arkadaşların bağlantıyla katılır, proje bilgilerini birlikte düzenlersiniz.
        </FadeUp>
      </div>
      <div style={{ position: "absolute", left: 960, top: 300, width: 840, display: "grid", gap: 26 }}>
        <FadeUp at={12} style={{ display: "grid", gap: 14 }}>
          <div style={{ fontFamily: F.display, fontSize: 22, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink3 }}>Davet bağlantısı</div>
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ flex: 1, border: `2px solid ${C.rule}`, background: C.plinth, padding: "18px 20px", fontFamily: F.mono, fontSize: 28, color: C.ink, borderRadius: 3 }}>{config.siteUrl}/davet/7KQ2…</div>
            <Btn size={28} pressed={frame >= 60 && frame < 66}>
              {copied ? "Kopyalandı ✓" : "Kopyala"}
            </Btn>
          </div>
        </FadeUp>
        <div style={{ display: "flex", gap: 22, marginTop: 30 }}>
          {people.map((p, i) => {
            const s = pop(frame, 90 + i * 12, 10, 200);
            return (
              <React.Fragment key={p.l}>
                <div style={{ width: 130, height: 130, borderRadius: 65, background: p.c, color: C.deep, fontFamily: F.display, fontWeight: 800, fontSize: 60, display: "grid", placeItems: "center", transform: `scale(${s})`, border: `5px solid ${C.wall}`, marginLeft: i ? -20 : 0 }}>{p.l}</div>
                <Sfx name="pop" at={90 + i * 12} volume={0.4} />
              </React.Fragment>
            );
          })}
          <FadeUp at={130} style={{ alignSelf: "center", marginLeft: 20, fontFamily: F.display, fontSize: 36, color: C.leaf }}>
            Ekip Yeşil · 4 kişi
          </FadeUp>
        </div>
      </div>
      <Cursor
        path={[
          { at: 20, x: 1800, y: 900 },
          { at: 50, x: 1760, y: 395 },
        ]}
        clickAt={[60]}
      />
    </Scene>
  );
};

/* S16 · En önemli adım */

const Row: React.FC<{ k: string; v: React.ReactNode; color?: string; tag?: React.ReactNode }> = ({ k, v, color = C.ink, tag }) => (
  <div style={{ display: "grid", gridTemplateColumns: "250px 1fr auto", alignItems: "baseline", gap: 20 }}>
    <span style={{ fontFamily: F.display, fontSize: 22, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink3 }}>{k}</span>
    <span style={{ fontFamily: F.mono, fontSize: 34, color }}>{v}</span>
    <span>{tag}</span>
  </div>
);

export const S16Teslim: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const click = 176;
  const accepted = 266;
  const working = frame >= click && frame < accepted;
  const done = frame >= accepted;
  const head = 296;
  const sh = shake(frame, head + 4, 10, 10);
  const term = 1 - ease(frame, head - 24, 14);
  const pushText = "git push";
  const typed = pushText.slice(0, Math.round(pushText.length * ease(frame, 10, 16)));
  return (
    <Scene dur={dur}>
      <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
        <div style={{ position: "absolute", left: 110, top: 90 }}>
          <Kicker at={2} color={C.blush}>En önemli adım</Kicker>
        </div>
        {term > 0 && (
          <div style={{ position: "absolute", left: 110, top: 150, width: 1000, opacity: term, background: "#070814", border: `2px solid ${C.rule}`, borderRadius: 6, padding: "22px 28px", fontFamily: F.mono, fontSize: 34, color: C.ink2, display: "grid", gap: 8 }}>
            <span>
              <span style={{ color: C.leaf }}>$</span> {typed}
              {frame < 30 && <span style={{ color: C.indigo }}>▍</span>}
            </span>
            {frame >= 34 && <span style={{ color: C.ink3 }}>main → main · a41c9e2</span>}
          </div>
        )}
        {frame >= head && (
          <div style={{ position: "absolute", left: 110, top: 140, width: 1150 }}>
            <Words text="Push etmek ≠ teslim etmek" at={head} size={96} accent={["≠"]} accentColor={C.blush} />
          </div>
        )}
        <div style={{ position: "absolute", left: 110, top: 360, width: 1080, background: C.plinth, border: `2px solid ${C.rule}`, borderRadius: 3, padding: 40, display: "grid", gap: 26, opacity: ease(frame, 40, 14) }}>
          <Example />
          <Row k="Repo" v="ekip-yesil/orman-gozu" />
          <Row k="Son push" v={frame >= 50 ? "a41c9e2 · 14:32" : "7f03b1d · 11:04"} color={frame >= 50 && !done ? C.blush : C.ink} tag={frame >= 50 && !done ? <span style={{ fontFamily: F.display, fontSize: 22, color: C.blush }}>YENİ</span> : null} />
          <Row
            k="Kabul edilen"
            v={done ? "a41c9e2 · 14:33" : working ? "Teslim sürümü hazırlanıyor…" : "7f03b1d · 11:05"}
            color={done ? C.leaf : working ? C.indigo : C.ink3}
            tag={done ? <span style={{ fontFamily: F.display, fontSize: 30, color: C.leaf }}>✓</span> : !working && frame >= 50 ? <span style={{ fontFamily: F.display, fontSize: 22, color: C.ink3 }}>ESKİ</span> : null}
          />
          <div style={{ marginTop: 8 }}>
            <Btn pressed={frame >= click && frame < click + 6} glow={frame > 120 && frame < click} disabled={working} size={40}>
              {working ? `Teslim sürümü hazırlanıyor${".".repeat(1 + (Math.floor(frame / 8) % 3))}` : "Teslim sürümünü güncelle"}
            </Btn>
          </div>
        </div>
        {frame >= 330 && (
          <FadeUp at={330} style={{ position: "absolute", left: 110, top: 860, width: 1100, fontFamily: F.display, fontSize: 46, lineHeight: 1.25, color: C.ink2 }}>
            Yalnızca sunucumuzda <b style={{ color: C.ink, fontWeight: 600 }}>arşivlenip doğrulanan</b> sürüm sayılır.
          </FadeUp>
        )}
      </AbsoluteFill>
      <Sfx name="ding" at={accepted} />
      <Sfx name="whoosh" at={head - 6} volume={0.5} />
      <Cursor
        path={[
          { at: 130, x: 1500, y: 1000 },
          { at: 166, x: 690, y: 690 },
        ]}
        clickAt={[click]}
      />
      <Mascot frame={frame} x={1580} y={1030} size={500} mood="heyecanli" accessories={["megafon"]} enterAt={0} wiggle={2} />
      <Bubble at={60} until={140} x={1300} y={170} size={58} tail="br">
        Push ettin mi?
      </Bubble>
      <Bubble at={146} until={286} x={1250} y={150} size={50} width={600} tail="br">
        Hemen <b style={{ color: C.indigoFill }}>Teslim sürümünü güncelle!</b>
      </Bubble>
      <Bubble at={380} x={1250} y={200} size={46} width={600} tail="br">
        Sadece push'la yetinme, teslim et. 📣
      </Bubble>
    </Scene>
  );
};

/* S17 · Son saniye */

export const S17SonSaniye: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const sec = Math.min(50 + Math.floor(frame / 30), 57);
  const pulse = (frame % 30) / 30;
  return (
    <Scene dur={dur}>
      <div style={{ position: "absolute", left: 110, top: 120, width: 1100, display: "grid", gap: 30 }}>
        <Kicker at={2} color={C.blush}>Son dakika</Kicker>
        <Words text="Son saniyeyi bekleme!" at={8} size={110} dot={false} accent={["bekleme!"]} accentColor={C.blush} />
      </div>
      <div style={{ position: "absolute", left: 110, top: 430, fontFamily: F.display, fontWeight: 600, fontSize: 250, letterSpacing: "-0.03em", color: C.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
        19<span style={{ color: C.indigo }}>:</span>59<span style={{ color: C.indigo }}>:</span>
        <span style={{ color: C.indigo, display: "inline-block", transform: `scale(${1 + (1 - pulse) * 0.06})` }}>{sec}</span>
      </div>
      {new Array(8).fill(0).map((_, i) => (
        <Sfx key={i} name="tik" at={i * 30} volume={0.5} />
      ))}
      <FadeUp at={90} style={{ position: "absolute", left: 110, top: 760, width: 1150, fontFamily: F.display, fontSize: 50, lineHeight: 1.25, color: C.ink2 }}>
        Son 10 saniyede istenen güncelleme <b style={{ color: C.blush, fontWeight: 600 }}>yetişmeyebilir.</b>
      </FadeUp>
      <Mascot frame={frame} x={1560} y={1030} size={520} mood="panik" enterAt={0} wiggle={3} />
    </Scene>
  );
};

/* S18 · Mühürlendi. */

const EXHIBITS = [
  { c: C.leaf, n: "No. 001 · Orman Gözü", e: "🌲" },
  { c: C.blush, n: "No. 002 · Damla", e: "💧" },
  { c: C.indigo, n: "No. 003 · Hava Nabzı", e: "🌬️" },
  { c: C.ink, n: "No. 004 · Atık Av", e: "♻️" },
];

export const S18Muhur: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const glassAt = 90;
  const glassDur = 42; // 1400 ms
  const g = glass(frame, glassAt, glassDur);
  const hit = glassAt + glassDur;
  const sh = shake(frame, hit, 12, 16);
  const stamp = frame < hit ? 0 : lin(frame, [hit, hit + 7], [0, 1]);
  const sec = Math.min(57 + Math.floor(frame / 30), 60);
  const clock = sec >= 60 ? "20:00:00" : `19:59:${sec}`;
  const lines = [
    { k: "commit", v: "a41c9e2" },
    { k: "zip", v: "orman-gozu-a41c9e2.zip" },
    { k: "sha256", v: "9c1e…40ab" },
  ];
  return (
    <Scene dur={dur}>
      <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
        <div style={{ position: "absolute", left: 110, right: 110, top: 200, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 40, opacity: 0.85 }}>
          {EXHIBITS.map((e, i) => (
            <FadeUp key={e.n} at={4 + i * 5} style={{ display: "grid", gap: 16 }}>
              <div style={{ aspectRatio: "1", background: C.plinth, border: `2px solid ${C.rule}`, display: "grid", placeItems: "center" }}>
                <div style={{ width: "46%", aspectRatio: "1", background: e.c, borderRadius: 3, display: "grid", placeItems: "center", fontSize: 90 }}>{e.e}</div>
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 24, color: C.ink3 }}>{e.n}</div>
            </FadeUp>
          ))}
        </div>
        <div style={{ position: "absolute", left: 110, top: 70, fontFamily: F.display, fontSize: 22, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink3, opacity: 1 - g }}>Vitrin açık · örnek eserler</div>
        {/* Cam soldan kayarak kapanır. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: 1920 * g,
            background: "linear-gradient(100deg, rgba(91,70,230,0.62), rgba(91,70,230,0.36) 60%, rgba(157,143,255,0.46))",
            backdropFilter: "blur(5px)",
            borderRight: g > 0 && g < 1 ? "6px solid rgba(255,255,255,0.8)" : undefined,
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.12) 38%, transparent 46%)" }} />
        </div>
        <div style={{ position: "absolute", right: 110, top: 60, fontFamily: F.display, fontWeight: 600, fontSize: 74, fontVariantNumeric: "tabular-nums", color: sec >= 60 ? "#fff" : C.ink }}>{clock}</div>
        {stamp > 0 && (
          <div style={{ position: "absolute", left: 110, top: 300, display: "grid", gap: 30 }}>
            <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 200, letterSpacing: "-0.04em", color: "#fff", lineHeight: 1, transform: `scale(${1.7 - 0.7 * stamp})`, transformOrigin: "0% 50%", opacity: stamp }}>
              Mühürlendi<span style={{ color: C.blush }}>.</span>
            </div>
            <FadeUp at={hit + 24} style={{ fontFamily: F.display, fontSize: 52, color: "#fff" }}>
              Son kabul edilen sürüm <b>kilitlenir.</b>
            </FadeUp>
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {lines.map((l, i) => (
                <FadeUp key={l.k} at={hit + 48 + i * 12} dist={10} style={{ fontFamily: F.mono, fontSize: 36, color: "#dcd6ff" }}>
                  <span style={{ display: "inline-block", width: 190 }}>{l.k}</span>
                  <b style={{ color: "#fff" }}>{l.v}</b>
                </FadeUp>
              ))}
            </div>
          </div>
        )}
      </AbsoluteFill>
      <Sfx name="cam" at={glassAt} />
      <Sfx name="tak" at={hit} />
      {lines.map((l, i) => (
        <Sfx key={l.k} name="tik" at={hit + 48 + i * 12} volume={0.4} />
      ))}
      <Mascot frame={frame} x={1600} y={1040} size={440} mood="normal" accessories={frame >= hit + 10 ? ["gozluk"] : []} glassesDrop={ease(frame, hit + 10, 12)} enterAt={0} />
      <Bubble at={hit + 100} x={1240} y={450} size={42} width={580} tail="br">
        Sonradan push, force-push, repoyu silmek… hiçbiri değiştiremez. 😎
      </Bubble>
    </Scene>
  );
};

/* S19 · Sonrası */

export const S19Sonrasi: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const card = (at: number): React.CSSProperties => {
    const p = pop(frame, at, 13, 160);
    return { transform: `translateY(${(1 - Math.min(p, 1)) * 120}px) rotate(${(1 - Math.min(p, 1)) * 4}deg)`, opacity: Math.min(p * 1.6, 1) };
  };
  const label: React.CSSProperties = { fontFamily: F.display, fontSize: 18, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink3 };
  return (
    <Scene dur={dur}>
      <div style={{ position: "absolute", left: 110, top: 110, width: 1500 }}>
        <Words text="Projen sergide yerini alır" at={6} size={92} accent={["sergide"]} />
      </div>
      <div style={{ position: "absolute", left: 110, top: 330, display: "flex", gap: 40 }}>
        <div style={{ width: 380, background: C.plinth, border: `2px solid ${C.rule}`, padding: 28, display: "grid", gap: 14, ...card(30) }}>
          <span style={label}>Sergi</span>
          <div style={{ aspectRatio: "1", background: C.wall, border: `2px solid ${C.rule}`, display: "grid", placeItems: "center" }}>
            <div style={{ width: "46%", aspectRatio: "1", background: C.leaf, borderRadius: 3, display: "grid", placeItems: "center", fontSize: 70 }}>🌲</div>
          </div>
          <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 34, color: C.ink }}>Orman Gözü</span>
          <span style={{ fontFamily: F.mono, fontSize: 22, color: C.ink3 }}>No. 001 · Ekip Yeşil</span>
        </div>
        <div style={{ width: 380, background: C.paper, color: C.deep, padding: 28, display: "grid", gap: 12, alignContent: "start", ...card(48) }}>
          <span style={{ ...label, color: "#61667d" }}>Makbuz</span>
          <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: 40 }}>
            Mühür makbuzu<span style={{ color: C.indigoFill }}>.</span>
          </span>
          {[
            ["Eser", "No. 001"],
            ["Commit", "a41c9e2"],
            ["Mühür", "7 Kas 20:00"],
            ["SHA-256", "9c1e…40ab"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #d3d9e2", paddingTop: 10, fontSize: 24 }}>
              <span style={{ fontFamily: F.display, color: "#61667d" }}>{k}</span>
              <span style={{ fontFamily: F.mono }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ width: 380, background: C.plinth, border: `2px solid ${C.rule}`, padding: 28, display: "grid", gap: 18, alignContent: "start", ...card(66) }}>
          <span style={label}>Doğrula</span>
          <div style={{ border: `2px dashed ${C.rule}`, padding: 22, fontFamily: F.mono, fontSize: 22, color: C.ink2, textAlign: "center" }}>orman-gozu-a41c9e2.zip</div>
          <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 34, color: C.leaf }}>✓ SHA-256 eşleşti</div>
          <span style={{ fontFamily: F.display, fontSize: 24, color: C.ink3, lineHeight: 1.3 }}>Herkes mühürlü kopyayı kendisi doğrulayabilir.</span>
        </div>
      </div>
      <FadeUp at={110} style={{ position: "absolute", left: 110, top: 930, fontFamily: F.display, fontSize: 46, color: C.ink2 }}>
        <b style={{ color: C.blush, fontWeight: 600 }}>Halkın seçimi</b> oylaması da burada. ❤️
      </FadeUp>
      <Sfx name="whoosh" at={30} volume={0.3} />
      <Sfx name="whoosh" at={48} volume={0.3} />
      <Sfx name="whoosh" at={66} volume={0.3} />
      <Mascot frame={frame} x={1640} y={1040} size={420} mood="mutlu" accessories={frame >= 110 ? ["kalp"] : []} enterAt={0} />
    </Scene>
  );
};
