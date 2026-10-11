import React from "react";
import { AbsoluteFill, Html5Audio, Sequence, random, staticFile, useCurrentFrame } from "remotion";
import { ease, exitFade, lin, pop } from "../anim";
import { config } from "../config";
import { C, F } from "../theme";

/* ---------- Zemin ---------- */

export const Bg: React.FC<{ tint?: "indigo" | "leaf" | "night"; children?: React.ReactNode }> = ({ tint = "indigo", children }) => {
  const frame = useCurrentFrame();
  const glow = tint === "leaf" ? "rgba(127,217,154,0.13)" : tint === "night" ? "rgba(60,50,160,0.22)" : "rgba(91,70,230,0.2)";
  const drift = Math.sin(frame / 90) * 40;
  return (
    <AbsoluteFill lang="tr" style={{ background: C.wall, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1150px 760px at ${1500 + drift}px 320px, ${glow}, transparent 70%), radial-gradient(900px 560px at ${200 - drift}px 980px, rgba(254,204,215,0.06), transparent 70%)`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

/** Sahne kabuğu: giriş ve çıkışta yumuşak geçiş, girişte whoosh. */
export const Scene: React.FC<{ dur: number; tint?: "indigo" | "leaf" | "night"; whoosh?: boolean; children: React.ReactNode }> = ({ dur, tint, whoosh = true, children }) => {
  const frame = useCurrentFrame();
  const o = Math.min(lin(frame, [0, 6], [0, 1]), exitFade(frame, dur, 8));
  return (
    <Bg tint={tint}>
      <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>
      {whoosh && <Sfx name="whoosh" at={0} volume={0.45} />}
    </Bg>
  );
};

/* ---------- Ses ---------- */

const SFX_LEN: Record<string, number> = { pop: 6, whoosh: 22, tik: 3, ding: 30, cam: 46, tak: 22, konfeti: 50 };

export const Sfx: React.FC<{ name: keyof typeof SFX_LEN; at: number; volume?: number }> = ({ name, at, volume = 1 }) => (
  <Sequence from={at} durationInFrames={SFX_LEN[name] + 2} layout="none">
    <Html5Audio src={staticFile(`sfx/${name}.wav`)} volume={volume * config.sfxVolume} />
  </Sequence>
);

/* ---------- Konuşma balonu ---------- */

type Tail = "bl" | "br" | "l" | "r" | "none";

export const Bubble: React.FC<{
  at: number;
  until?: number;
  x: number;
  y: number;
  width?: number;
  size?: number;
  tail?: Tail;
  sound?: boolean;
  children: React.ReactNode;
}> = ({ at, until, x, y, width, size = 52, tail = "bl", sound = true, children }) => {
  const frame = useCurrentFrame();
  if (frame < at || (until !== undefined && frame > until + 7)) return sound ? <Sfx name="pop" at={at} volume={0.7} /> : null;
  const inn = pop(frame, at, 10, 220);
  const out = until === undefined ? 1 : 1 - ease(frame, until, 7);
  const sc = Math.max(0, inn * out);
  const origin = tail === "bl" ? "12% 110%" : tail === "br" ? "88% 110%" : tail === "l" ? "-4% 50%" : tail === "r" ? "104% 50%" : "50% 50%";
  const t = 34;
  const tailStyle: React.CSSProperties =
    tail === "bl"
      ? { left: 54, bottom: -t + 4, clipPath: "polygon(0 0, 100% 0, 18% 100%)" }
      : tail === "br"
        ? { right: 54, bottom: -t + 4, clipPath: "polygon(0 0, 100% 0, 82% 100%)" }
        : tail === "l"
          ? { left: -t + 4, top: "42%", clipPath: "polygon(100% 0, 0 50%, 100% 100%)" }
          : tail === "r"
            ? { right: -t + 4, top: "42%", clipPath: "polygon(0 0, 100% 50%, 0 100%)" }
            : { display: "none" };
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width,
          whiteSpace: width ? undefined : "nowrap",
          background: C.paper,
          color: C.deep,
          fontFamily: F.display,
          fontWeight: 600,
          fontSize: size,
          lineHeight: 1.16,
          letterSpacing: "-0.01em",
          padding: `${size * 0.5}px ${size * 0.72}px`,
          borderRadius: size * 0.6,
          transform: `scale(${sc})`,
          transformOrigin: origin,
          boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
        }}
      >
        {children}
        <div style={{ position: "absolute", width: t, height: t, background: C.paper, ...tailStyle }} />
      </div>
      {sound && <Sfx name="pop" at={at} volume={0.7} />}
    </>
  );
};

/* ---------- Tipografi ---------- */

/** Kelime kelime aşağıdan gelen büyük yazı. `accent` içindeki kelimeler indigo, `dot` sonda indigo nokta. */
export const Words: React.FC<{
  text: string;
  at: number;
  size?: number;
  weight?: number;
  color?: string;
  accent?: string[];
  accentColor?: string;
  dot?: string | false;
  stagger?: number;
  style?: React.CSSProperties;
  tick?: boolean;
}> = ({ text, at, size = 110, weight = 800, color = C.ink, accent = [], accentColor = C.indigo, dot = C.indigo, stagger = 3, style, tick = false }) => {
  const frame = useCurrentFrame();
  // Sondaki nokta indigo yazılır; "!", "?", "," ya da "…" ile biten başlığa nokta eklenmez.
  const trimmed = dot === false ? text : text.replace(/\.$/, "");
  const showDot = dot !== false && !/[!?,…]$/.test(trimmed);
  const words = trimmed.split(" ");
  return (
    <div style={{ fontFamily: F.display, fontWeight: weight, fontSize: size, lineHeight: 1.0, letterSpacing: "-0.035em", color, ...style }}>
      {words.map((w, i) => {
        const p = pop(frame, at + i * stagger, 13, 200);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", paddingBottom: "0.12em", marginBottom: "-0.12em" }}>
            <span
              style={{
                display: "inline-block",
                // Kırpma kutusu 0,12em alt pay taşır ve şapkalı/noktalı harfler kutunun üstüne taşar;
                // bekleyen kelimenin tepesi görünmesin diye %140 itilir.
                transform: `translateY(${(1 - Math.min(p, 1.05)) * 140}%)`,
                color: accent.includes(w.replace(/[.,!?]/g, "")) ? accentColor : undefined,
              }}
            >
              {w}
              {i === words.length - 1 && showDot ? <span style={{ color: dot || undefined }}>.</span> : null}
              {i < words.length - 1 ? " " : null}
            </span>
          </span>
        );
      })}
      {tick && words.map((_, i) => <Sfx key={i} name="tik" at={at + i * stagger} volume={0.25} />)}
    </div>
  );
};

export const Kicker: React.FC<{ at: number; color?: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, color = C.indigo, children, style }) => {
  const frame = useCurrentFrame();
  const p = ease(frame, at, 14);
  return (
    <div
      style={{
        fontFamily: F.mono,
        fontSize: 26,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color,
        opacity: p,
        transform: `translateX(${(1 - p) * -30}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const FadeUp: React.FC<{ at: number; dur?: number; dist?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, dur = 14, dist = 30, style, children }) => {
  const frame = useCurrentFrame();
  const p = ease(frame, at, dur);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * dist}px)`, ...style }}>{children}</div>;
};

/** Çizilerek uzayan indigo çizgi. */
export const RuleLine: React.FC<{ at: number; width?: number; color?: string }> = ({ at, width = 180, color = C.indigo }) => {
  const frame = useCurrentFrame();
  return <div style={{ height: 6, width: width * ease(frame, at, 16), background: color, borderRadius: 2 }} />;
};

/* ---------- Konfeti ---------- */

export const Confetti: React.FC<{ at: number; count?: number; originX?: number; originY?: number }> = ({ at, count = 140, originX = 960, originY = 620 }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0) return null;
  const colors = [C.indigo, C.blush, C.leaf, "#FFCF5C", C.paper, C.indigoFill];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {new Array(count).fill(0).map((_, i) => {
        const a = random(`a${i}`) * Math.PI - Math.PI; // yukarı yarım daire
        const v = 18 + random(`v${i}`) * 26;
        const x = originX + Math.cos(a) * v * t * 1.4;
        const y = originY + Math.sin(a) * v * t + 0.55 * t * t;
        const rot = random(`r${i}`) * 360 + t * (8 + random(`s${i}`) * 14);
        const w = 14 + random(`w${i}`) * 16;
        const op = lin(t, [70, 100], [1, 0]);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: w,
              height: w * 0.45,
              background: colors[i % colors.length],
              transform: `rotate(${rot}deg) scaleY(${Math.cos(t / 3 + i)})`,
              opacity: op,
              borderRadius: 2,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/* ---------- İmleç ---------- */

export const Cursor: React.FC<{ path: { at: number; x: number; y: number }[]; clickAt?: number[] }> = ({ path, clickAt = [] }) => {
  const frame = useCurrentFrame();
  if (frame < path[0].at) return null;
  let x = path[0].x;
  let y = path[0].y;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const p = ease(frame, a.at, b.at - a.at);
    if (frame >= a.at) {
      x = a.x + (b.x - a.x) * p;
      y = a.y + (b.y - a.y) * p;
    }
  }
  const press = clickAt.some((c) => frame >= c && frame < c + 6);
  return (
    <>
      <svg width={54} height={54} viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, transform: `scale(${press ? 0.85 : 1})`, transformOrigin: "10% 10%", filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.4))" }}>
        <path d="M3 2 L20 12 L12 13.5 L8.5 21 Z" fill="#fff" stroke={C.deep} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
      {clickAt.map((c) => (
        <Sfx key={c} name="tik" at={c} volume={0.8} />
      ))}
    </>
  );
};

/* ---------- Arayüz parçaları (sitenin koyu temasıyla yeniden çizildi) ---------- */

export const Browser: React.FC<{ url: string; x: number; y: number; w: number; h: number; at: number; children: React.ReactNode }> = ({ url, x, y, w, h, at, children }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, at, 14, 140);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        background: C.wall,
        border: `2px solid ${C.rule}`,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 40px 80px rgba(0,0,0,0.45)",
        transform: `translateY(${(1 - Math.min(p, 1)) * 80}px) scale(${0.94 + 0.06 * Math.min(p, 1)})`,
        opacity: Math.min(p * 1.5, 1),
      }}
    >
      <div style={{ height: 64, background: C.plinth, borderBottom: `2px solid ${C.rule}`, display: "flex", alignItems: "center", gap: 14, padding: "0 22px" }}>
        {["#ff6b6b", "#ffcf5c", "#7fd99a"].map((c) => (
          <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c, opacity: 0.8 }} />
        ))}
        <div style={{ marginLeft: 18, flex: 1, height: 38, borderRadius: 6, background: C.wall, display: "flex", alignItems: "center", padding: "0 18px", fontFamily: F.mono, fontSize: 22, color: C.ink2 }}>
          🔒&nbsp;{url}
        </div>
      </div>
      <div style={{ position: "relative", height: h - 64 }}>{children}</div>
    </div>
  );
};

export const Btn: React.FC<{ children: React.ReactNode; pressed?: boolean; glow?: boolean; size?: number; disabled?: boolean; style?: React.CSSProperties }> = ({ children, pressed, glow, size = 34, disabled, style }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        background: disabled ? C.rule : C.indigoFill,
        color: disabled ? C.ink3 : "#fff",
        fontFamily: F.display,
        fontWeight: 600,
        fontSize: size,
        padding: `${size * 0.5}px ${size * 0.9}px`,
        borderRadius: 3,
        transform: `scale(${pressed ? 0.97 : 1})`,
        outline: glow ? `${5 + Math.sin(frame / 4) * 2}px solid rgba(157,143,255,${0.35 + Math.sin(frame / 4) * 0.2})` : undefined,
        outlineOffset: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Field: React.FC<{ label: string; value: string; progress: number; mono?: boolean; height?: number }> = ({ label, value, progress, mono, height }) => {
  const shown = value.slice(0, Math.round(value.length * progress));
  const typing = progress > 0 && progress < 1;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontFamily: F.display, fontSize: 20, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink3 }}>{label}</div>
      <div
        style={{
          background: C.plinth,
          border: `2px solid ${typing ? C.indigo : C.rule}`,
          borderRadius: 3,
          padding: "16px 20px",
          minHeight: height,
          fontFamily: mono ? F.mono : F.display,
          fontSize: 30,
          color: C.ink,
        }}
      >
        {shown}
        {typing && <span style={{ color: C.indigo }}>|</span>}
      </div>
    </div>
  );
};

/** Telegram tarzı bildirim kartı. */
export const Notice: React.FC<{ at: number; text: string; index: number; x: number; y: number; width?: number }> = ({ at, text, index, x, y, width = 760 }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const p = pop(frame, at, 12, 180);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x,
          top: y + index * 0,
          width,
          display: "flex",
          alignItems: "center",
          gap: 22,
          background: C.plinth,
          border: `2px solid ${C.rule}`,
          borderRadius: 22,
          padding: "20px 28px",
          fontFamily: F.display,
          fontWeight: 600,
          fontSize: 38,
          color: C.ink,
          transform: `translateY(${(1 - Math.min(p, 1)) * -90}px)`,
          opacity: Math.min(p * 2, 1),
          boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
        }}
      >
        <PlaneBadge />
        <div style={{ display: "grid", gap: 2 }}>
          <div style={{ fontSize: 22, fontWeight: 400, color: C.ink3, fontFamily: F.mono }}>EkoZeka · duyuru</div>
          <div>{text}</div>
        </div>
      </div>
      <Sfx name="ding" at={at} volume={0.5} />
    </>
  );
};

export const PlaneBadge: React.FC<{ size?: number }> = ({ size = 64 }) => (
  <div style={{ width: size, height: size, borderRadius: size / 2, background: C.indigoFill, display: "grid", placeItems: "center", flex: "none" }}>
    <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56}>
      <path d="M3 11.5 L21 4 L17.5 20 L11.5 15 L9.5 19.5 L9 14 L18 7 L7.5 12.8 Z" fill="#fff" />
    </svg>
  </div>
);

/** Maddeli kontrol kutusu. */
export const Check: React.FC<{ at: number; color?: string; size?: number }> = ({ at, color = C.leaf, size = 56 }) => {
  const frame = useCurrentFrame();
  const fill = ease(frame, at, 8);
  const draw = ease(frame, at + 4, 10);
  return (
    <div style={{ width: size, height: size, borderRadius: 4, border: `4px solid ${fill > 0.01 ? color : C.ink3}`, background: fill > 0 ? color : "transparent", opacity: 0.35 + fill * 0.65, display: "grid", placeItems: "center" }}>
      <svg viewBox="0 0 24 24" width={size * 0.72} height={size * 0.72}>
        <path d="M5 12.5 L10 17 L19 7" stroke={C.deep} strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={24} strokeDashoffset={24 * (1 - draw)} />
      </svg>
    </div>
  );
};
