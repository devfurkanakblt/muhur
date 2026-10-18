import { getMascotNamingSnapshot } from "@/lib/mascot-naming";

export async function GET() {
  return Response.json(await getMascotNamingSnapshot(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
