import { badge } from "@/lib/badge";
import { getEventBySlug, getExhibit, projectHasMystery } from "@/lib/data";

/** Gizem avcısı rozeti: ekipten biri açılış videosundaki gizemi çözdüyse "mühür. | gizem avcısı". */
export async function GET(_: Request, ctx: RouteContext<"/api/rozet/[slug]/[no]/gizem">) {
  const { slug, no } = await ctx.params;
  const event = await getEventBySlug(slug);
  const exhibit = event ? await getExhibit(event.id, Number(no)) : null;
  const found = exhibit ? await projectHasMystery(event!.id, exhibit.id) : false;
  const svg = found ? badge("gizem avcısı", "#2f7a4f") : badge("bulunamadı", "#61667d");
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
