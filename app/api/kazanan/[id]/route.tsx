import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { getEventById } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/server";
import { PEOPLES_CHOICE_PREFIX } from "@/lib/winner-model";
import { exhibitNo } from "@/lib/format";
import { getWinners } from "@/lib/winners";

const INK = "#0b0d1e";
const INK_2 = "#44485f";
const INK_3 = "#61667d";
const BLUSH = "#feccd7";

/** Kaide için logo: WEBP dahil her biçim PNG'ye çevrilir (görsel motoru WEBP çizmez). Alınamazsa null. */
async function logoData(url: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const png = await sharp(Buffer.from(await response.arrayBuffer())).resize(320, 320, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Kazananın etkinliği kaydın kendisinden okunur: jüri ödülünde ödül satırı, halkın seçiminde eser. */
async function winnerEventId(id: string): Promise<string | null> {
  const db = createAdminClient();
  const people = id.startsWith(PEOPLES_CHOICE_PREFIX);
  const { data, error } = people
    ? await db.from("projects").select("event_id").eq("id", id.slice(PEOPLES_CHOICE_PREFIX.length)).maybeSingle()
    : await db.from("awards").select("event_id").eq("id", id).maybeSingle();
  // Biçimi bozuk kimlik (uuid değil) "kazanan yok" sayılır.
  if (error) {
    if (error.code === "22P02") return null;
    throw new Error(`Kazanan okunamadı: ${error.message}`);
  }
  return (data?.event_id as string | undefined) ?? null;
}

/** Kazanan kartı: Telegram duyurusunun görseli. Yalnızca etkinliğin herkese açık kazanan bilgisi. */
export async function GET(_: Request, ctx: RouteContext<"/api/kazanan/[id]">) {
  const { id } = await ctx.params;
  const eventId = await winnerEventId(id);
  const event = eventId ? await getEventById(eventId) : null;
  const winner = event ? (await getWinners(event)).find((w) => w.id === id) : undefined;
  if (!event || !winner) return new Response("Kazanan bulunamadı.", { status: 404 });
  const [regular, semibold, mascot, logo] = await Promise.all([
    readFile(join(process.cwd(), "assets/schibsted-grotesk-400.woff")),
    readFile(join(process.cwd(), "assets/schibsted-grotesk-600.woff")),
    readFile(join(process.cwd(), "assets/mascot.svg")),
    logoData(winner.logo),
  ]);
  const jury = winner.kind === "juri";
  const nameSize = winner.name.length > 28 ? 60 : winner.name.length > 18 ? 76 : 92;
  const members = winner.members.map((m) => m.login).join(" · ");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", justifyContent: "space-between", background: "#eef2f6", color: INK, fontFamily: "Schibsted Grotesk", padding: "60px 72px" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 690 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex" }}>
              <div style={{ display: "flex", background: BLUSH, color: INK, fontSize: 26, fontWeight: 600, letterSpacing: "0.08em", padding: "8px 18px", borderRadius: 2, transform: "rotate(-2deg)" }}>
                {jury ? "JÜRİ ÖDÜLÜ" : "HALKIN SEÇİMİ"}
              </div>
            </div>
            <div style={{ fontSize: 40, fontWeight: 600, color: INK_2, marginTop: 34, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              {jury ? winner.title : `${winner.votes} oy`}
            </div>
            <div style={{ fontSize: nameSize, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.02, marginTop: 14 }}>{winner.name}</div>
            <div style={{ fontSize: 34, color: INK_2, marginTop: 14 }}>{winner.team}</div>
            {members && <div style={{ fontSize: 24, color: INK_3, marginTop: 12 }}>{members}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", fontSize: 52, fontWeight: 600, letterSpacing: "-0.04em" }}>
              mühür<span style={{ color: "#4a36cf" }}>.</span>
            </div>
            <div style={{ fontSize: 24, color: INK_3 }}>{event.title}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ position: "relative", width: 320, height: 320, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fb", border: "2px solid #d3d9e2" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} width={160} height={160} alt="" style={{ objectFit: "contain" }} /> : <div style={{ fontSize: 22, color: INK_3 }}>Logo yok</div>}
            <div style={{ position: "absolute", right: -22, bottom: 22, display: "flex", background: BLUSH, color: INK, fontSize: 24, padding: "6px 14px", borderRadius: 2, transform: "rotate(-6deg)", fontFamily: "Schibsted Grotesk", fontWeight: 600 }}>
              {exhibitNo(winner.no)}
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/svg+xml;base64,${mascot.toString("base64")}`} width={190} height={155} alt="" />
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Schibsted Grotesk", data: regular, weight: 400, style: "normal" },
        { name: "Schibsted Grotesk", data: semibold, weight: 600, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    },
  );
}
