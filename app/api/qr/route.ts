import { qrSvg } from "@/lib/qr";
import { env } from "@/lib/env";

export async function GET() {
  try {
    return new Response(qrSvg(`${env.siteUrl.replace(/\/$/, "")}/`), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
  } catch {
    return Response.json({ error: "Site adresi QR kapasitesini aşıyor. Kısa bir alan adı kullan." }, { status: 422 });
  }
}
