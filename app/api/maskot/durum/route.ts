import { getMascotNamingSnapshot, hasMascotNaming } from "@/lib/mascot-naming";
import { eventFromRequest } from "@/lib/event-request";

export async function GET(request: Request) {
  const event = await eventFromRequest(request);
  if (event instanceof Response) return event;
  if (!hasMascotNaming(event)) return Response.json({ error: "Etkinlik bulunamadı." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(await getMascotNamingSnapshot(event), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
