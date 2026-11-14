import "server-only";
import { getEventBySlug, type EventState } from "@/lib/data";

/** Yoklama uçları etkinliği `?e=<slug>` ile alır; eksik ya da bilinmeyen slug 404 JSON döner. */
export async function eventFromRequest(request: Request): Promise<EventState | Response> {
  const slug = new URL(request.url).searchParams.get("e")?.trim() ?? "";
  const event = slug ? await getEventBySlug(slug) : null;
  return event ?? Response.json({ error: "Etkinlik bulunamadı." }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
