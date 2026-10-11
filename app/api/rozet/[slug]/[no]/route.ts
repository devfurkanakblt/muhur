import { badge } from "@/lib/badge";
import { getEventBySlug, getExhibit } from "@/lib/data";

export async function GET(_: Request, ctx: RouteContext<"/api/rozet/[slug]/[no]">) {
  const { slug, no } = await ctx.params;
  const event = await getEventBySlug(slug);
  const exhibit = event ? await getExhibit(event.id, Number(no)) : null;
  const svg = !exhibit
    ? badge("bulunamadı", "#61667d")
    : exhibit.archive_sha256 && exhibit.frozen_sha
      ? badge(exhibit.frozen_sha.slice(0, 7), "#4a36cf")
      : badge(event!.locked ? exhibit.freeze_error || !exhibit.accepted_sha ? "teslim sorunu" : "mühürleniyor" : exhibit.accepted_sha ? "teslim kabul edildi" : "kayıtlı", "#44485f");
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // GitHub görselleri önbelleğe alır; mühür vurulunca kısa sürede güncellensin.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
