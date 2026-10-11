import QRCode from "qrcode";
import React from "react";
import { C } from "../theme";

/** Karekod, kare kare SVG olarak (render sırasında ağ gerekmez). */
export const Qr: React.FC<{ text: string; size: number; color?: string }> = ({ text, size, color = C.deep }) => {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(x, y)) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />);
    }
  }
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges" style={{ display: "block" }}>
      <g fill={color}>{cells}</g>
    </svg>
  );
};
