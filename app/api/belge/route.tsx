import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getEventBySlug, getViewer } from "@/lib/data";
import { certificateAccess } from "@/lib/certificate-access";
import { formatDay } from "@/lib/format";
import { certificateName, dateRangeTR, fileSlug } from "@/lib/certificate";

const INK = "#0b0d1e";
const INK_2 = "#44485f";
const INK_3 = "#61667d";
const RULE = "#d3d9e2";
const INDIGO = "#4a36cf";
const BLUSH = "#feccd7";

/** A4 yatay, 150 dpi: yazdırınca keskin, paylaşınca hafif. */
const W = 1754;
const H = 1240;

const label = { fontSize: 22, fontWeight: 600, letterSpacing: "0.14em", color: INK_3 } as const;

const noStore = { "Cache-Control": "private, no-store" };

/**
 * Katılım belgesi: formdaki ad ve soyad, etkinliğin adı, düzenleyen topluluğu ve tarihleriyle PNG olarak basılır.
 * Yalnızca GitHub ile giriş yapmış etkinlik katılımcısı (ya da yönetici) alabilir; yanıt paylaşılan önbelleğe girmez.
 */
export async function GET(request: Request) {
  // Belge sayfası etkinliği `?e=<slug>` ile verir; eksik ya da bilinmeyen slug 404.
  const slug = new URL(request.url).searchParams.get("e")?.trim();
  const event = slug ? await getEventBySlug(slug) : null;
  if (!event) return new Response("Etkinlik bulunamadı.", { status: 404, headers: noStore });
  const viewer = await getViewer();
  const org = event.communityName ?? "mühür";
  const access = await certificateAccess(viewer, event);
  if (access === "giris") return new Response("Katılım belgesi için GitHub ile giriş yap.", { status: 401, headers: noStore });
  if (access === "katilimci-degil") return new Response("Katılım belgesini yalnızca etkinliğe katılan ekip üyeleri alabilir.", { status: 403, headers: noStore });

  const params = new URL(request.url).searchParams;
  const name = certificateName(params.get("ad"), params.get("soyad"));
  if (!name) return new Response("Ad ve soyad yalnızca harf, boşluk, kesme ve tire içerebilir (en fazla 40 karakter).", { status: 400, headers: noStore });

  const [regular, semibold, mascot] = await Promise.all([
    readFile(join(process.cwd(), "assets/schibsted-grotesk-400.woff")),
    readFile(join(process.cwd(), "assets/schibsted-grotesk-600.woff")),
    readFile(join(process.cwd(), "assets/mascot.svg")),
  ]);
  const nameSize = name.length > 34 ? 84 : name.length > 24 ? 108 : 132;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#ffffff", padding: 44, fontFamily: "Schibsted Grotesk", color: INK }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", border: `3px solid ${INK}`, padding: "72px 96px 64px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <div style={{ display: "flex", fontSize: 64, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1 }}>
                mühür<span style={{ color: INDIGO }}>.</span>
              </div>
              <div style={{ display: "flex", borderLeft: `2px solid ${RULE}`, paddingLeft: 22, fontSize: 30, color: INK_3, lineHeight: 1 }}>{org}</div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/svg+xml;base64,${mascot.toString("base64")}`} width={200} height={163} alt="" />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ ...label, fontSize: 28, letterSpacing: "0.22em" }}>KATILIM BELGESİ</div>
            <div style={{ fontSize: nameSize, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.04, marginTop: 30 }}>{name}</div>
            <div style={{ width: 160, height: 4, background: INK, marginTop: 40 }} />
            <div style={{ fontSize: 36, lineHeight: 1.45, color: INK_2, marginTop: 40, maxWidth: 1240 }}>
              {`${dateRangeTR(event.startsAt, event.sealTime)} tarihlerinde ${org} tarafından düzenlenen ${event.title} etkinliğine katılmış, süre dolana kadar üretmiştir.`}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: `2px solid ${RULE}`, paddingTop: 34 }}>
            <div style={{ display: "flex", gap: 88 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={label}>ETKİNLİK</div>
                <div style={{ fontSize: 32, fontWeight: 600 }}>{event.title}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={label}>TARİH</div>
                <div style={{ fontSize: 32, fontWeight: 600 }}>{formatDay(event.sealTime)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={label}>DÜZENLEYEN</div>
                <div style={{ fontSize: 32, fontWeight: 600 }}>{org}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14 }}>
              <div style={{ display: "flex", background: BLUSH, color: INK, fontSize: 30, fontWeight: 600, letterSpacing: "0.08em", padding: "10px 22px", borderRadius: 2, transform: "rotate(-4deg)" }}>
                KATILDI
              </div>
              <div style={{ fontSize: 22, color: INK_3 }}>Süre dolar, mühür vurulur.</div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Schibsted Grotesk", data: regular, weight: 400, style: "normal" },
        { name: "Schibsted Grotesk", data: semibold, weight: 600, style: "normal" },
      ],
      headers: {
        // Oturuma bağlı yanıt: CDN'de tutulursa adresi bilen herkes girişsiz açabilirdi.
        "Cache-Control": "private, max-age=3600",
        Vary: "Cookie",
        ...(params.get("indir") === "1" ? { "Content-Disposition": `attachment; filename="katilim-belgesi-${fileSlug(name)}.png"` } : {}),
      },
    },
  );
}
