import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "mühür. Süre dolar, mühür vurulur.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [regular, semibold, mascot] = await Promise.all([
    readFile(join(process.cwd(), "assets/schibsted-grotesk-400.woff")),
    readFile(join(process.cwd(), "assets/schibsted-grotesk-600.woff")),
    readFile(join(process.cwd(), "assets/mascot.svg")),
  ]);
  const mascotSrc = `data:image/svg+xml;base64,${mascot.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#eef2f6",
          color: "#0b0d1e",
          fontFamily: "Schibsted Grotesk",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 168, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>
            mühür<span style={{ color: "#4a36cf" }}>.</span>
          </div>
          <div style={{ fontSize: 44, marginTop: 28, color: "#44485f" }}>Süre dolar, mühür vurulur.</div>
          <div style={{ fontSize: 28, marginTop: 56, color: "#61667d" }}>DEÜ CS&AI topluluğu tarafından geliştirildi</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mascotSrc} width={360} height={294} alt="" />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Schibsted Grotesk", data: regular, weight: 400, style: "normal" },
        { name: "Schibsted Grotesk", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
