import React from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { ease } from "../anim";
import { config } from "../config";

/** Bitiş logoları: soldan sağa sırayla yükselir. `scale` config'teki 1080p yüksekliklerini çarpar. */
export const LogoRow: React.FC<{ at: number; scale?: number; gap: number; style?: React.CSSProperties }> = ({ at, scale = 1, gap, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap, ...style }}>
      {config.logos.map((l, i) => {
        const p = ease(frame, at + i * 5, 14);
        return <Img key={l.file} src={staticFile(`logolar/${l.file}`)} alt={l.name} style={{ height: l.h * scale, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }} />;
      })}
    </div>
  );
};
