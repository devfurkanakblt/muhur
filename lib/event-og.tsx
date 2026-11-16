import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getEventBySlug } from "@/lib/data";
import { eventBrandArt } from "@/lib/brand-image";

export const EVENT_OG_SIZE = { width: 1200, height: 630 };

/**
 * Etkinlik ve sergi paylaşım kartı: topluluk adı/logosu, etkinlik adı ve "mühür. ile" imzası.
 * Kök kartı (maskotlu platform kartı) etkinlik sayfalarına devrolmasın diye ayrı üretilir.
 */
export async function eventOgImage(slug: string) {
  const event = await getEventBySlug(slug);
  const [regular, semibold, art] = await Promise.all([
    readFile(join(process.cwd(), "assets/schibsted-grotesk-400.woff")),
    readFile(join(process.cwd(), "assets/schibsted-grotesk-600.woff")),
    event ? eventBrandArt(event) : Promise.resolve({ name: "mühür", mascot: null, logo: null }),
  ]);
  const title = event?.title ?? "Etkinlik bulunamadı";
  const titleSize = title.length > 32 ? 72 : title.length > 20 ? 92 : 112;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "72px 80px", background: "#eef2f6", color: "#0b0d1e", fontFamily: "Schibsted Grotesk" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 760 }}>
          <div style={{ fontSize: 34, color: "#44485f" }}>{art.name}</div>
          <div style={{ fontSize: titleSize, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.02, marginTop: 18 }}>{title}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 56, fontSize: 30, color: "#61667d" }}>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 600, letterSpacing: "-0.04em", color: "#0b0d1e" }}>
              mühür<span style={{ color: "#4a36cf" }}>.</span>
            </div>
            ile
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {art.mascot ? <img src={art.mascot} width={320} height={261} alt="" /> : art.logo ? <img src={art.logo} width={240} height={240} alt="" /> : <div style={{ display: "flex" }} />}
      </div>
    ),
    {
      ...EVENT_OG_SIZE,
      fonts: [
        { name: "Schibsted Grotesk", data: regular, weight: 400, style: "normal" },
        { name: "Schibsted Grotesk", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
