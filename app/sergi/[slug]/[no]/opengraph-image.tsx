import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getEventBySlug, getExhibit, logoUrl } from "@/lib/data";
import { exhibitNo } from "@/lib/format";
import { eventBrandArt, type BrandArt } from "@/lib/brand-image";

export const alt = "mühür. eser kartı";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string; no: string }> }) {
  const { slug, no } = await params;
  const event = await getEventBySlug(slug);
  const exhibit = event ? await getExhibit(event.id, Number(no)) : null;
  // Maskot yalnız maskotun topluluğunda; diğerlerinde topluluk logosu (kilitliyse kilit anındaki).
  const [regular, semibold, art] = await Promise.all([
    readFile(join(process.cwd(), "assets/schibsted-grotesk-400.woff")),
    readFile(join(process.cwd(), "assets/schibsted-grotesk-600.woff")),
    event ? eventBrandArt(event) : Promise.resolve<BrandArt>({ name: "mühür", mascot: null, logo: null }),
  ]);
  const logo = exhibit ? logoUrl(exhibit.logo_path) : null;
  const name = exhibit?.name ?? "Eser bulunamadı";
  const titleSize = name.length > 28 ? 64 : name.length > 18 ? 80 : 96;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#eef2f6",
          color: "#0b0d1e",
          fontFamily: "Schibsted Grotesk",
          padding: "64px 72px",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 700 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 26, color: "#61667d" }}>{exhibit ? `${exhibitNo(exhibit.exhibit_no)} · ${art.name} · ${event!.title}` : ""}</div>
            <div style={{ fontSize: titleSize, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.02, marginTop: 20 }}>{name}</div>
            <div style={{ fontSize: 36, color: "#44485f", marginTop: 16 }}>{exhibit?.team_name ?? ""}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 600, letterSpacing: "-0.04em" }}>
              mühür<span style={{ color: "#4a36cf" }}>.</span>
            </div>
            <div style={{ fontSize: 24, color: "#61667d" }}>{exhibit?.frozen_sha ? `Mühür ${exhibit.frozen_sha.slice(0, 7)}` : "Vitrinde"}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              width: 300,
              height: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f8f9fb",
              border: "2px solid #d3d9e2",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo && <img src={logo} width={150} height={150} alt="" style={{ objectFit: "contain" }} />}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {art.mascot ? <img src={art.mascot} width={200} height={163} alt="" /> : art.logo ? <img src={art.logo} width={140} height={140} alt="" /> : <div style={{ display: "flex", height: 140 }} />}
        </div>
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
