import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getListedEvents, getViewer, getViewerEvents, type EventState } from "@/lib/data";
import { eventPath, pickLegacyEvent, type EventSurface } from "@/lib/event-routes";

type Query = Record<string, string | string[] | undefined>;

/** Sorgu dizesi (`?hata=…`, `?kayit=tamam` gibi) yönlendirmede korunur. */
function withQuery(path: string, query: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, v);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * Eski adresler (/panel, /sahne, /belge, /maskot) en uygun etkinliğin yüzeyine 307 ile gider:
 * en yakın açık etkinlik, yoksa en yeni mühürlü. `viewerFirst` iken önce görüntüleyenin ekibinin etkinlikleri denenir.
 * Hiç etkinlik yoksa ana sayfa.
 */
export async function legacyRedirect(
  surface: EventSurface,
  searchParams: Promise<Query>,
  { viewerFirst = false, filter }: { viewerFirst?: boolean; filter?: (e: EventState) => boolean } = {},
): Promise<never> {
  await connection();
  const query = await searchParams;
  const now = Date.now();
  const only = (events: EventState[]) => (filter ? events.filter(filter) : events);
  const viewer = viewerFirst ? await getViewer() : null;
  const own = viewer ? pickLegacyEvent(only(await getViewerEvents(viewer.id)), now) : null;
  const target = own ?? pickLegacyEvent(only(await getListedEvents()), now);
  redirect(withQuery(target ? eventPath(target.slug, surface) : "/", query));
}
