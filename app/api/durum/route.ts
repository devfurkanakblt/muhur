import { getLiveStatus } from "@/lib/status";
import { eventFromRequest } from "@/lib/event-request";

export async function GET(request: Request) {
  const event = await eventFromRequest(request);
  if (event instanceof Response) return event;
  return Response.json(await getLiveStatus(event), { headers: { "Cache-Control": "private, no-store" } });
}
