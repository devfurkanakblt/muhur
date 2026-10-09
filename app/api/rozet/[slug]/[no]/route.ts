import { getEventBySlug, getExhibit } from "@/lib/data";

/**
 * README rozeti: "mühür. | vitrinde" ya da "mühür. | 3f9a2c1".
 * Metin genişlikleri 11px Verdana/DejaVu ölçülerine göre yaklaşık hesaplanır (shields.io ile aynı yaklaşım).
 */
function width(text: string) {
  return Math.round([...text].reduce((w, ch) => w + (/[ilj.:|' ]/.test(ch) ? 3.6 : /[mwMW]/.test(ch) ? 10 : 7), 0) + 12);
}

function badge(right: string, color: string) {
  const left = "mühür.";
  const lw = width(left);
  const rw = width(right);
  const total = lw + rw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${left} ${right}">
<title>${left} ${right}</title>
<clipPath id="r"><rect width="${total}" height="20" rx="3"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#0b0d1e"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,Geneva,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">mühür<tspan fill="#9d8fff">.</tspan></text>
<text x="${lw + rw / 2}" y="14">${right}</text>
</g></svg>`;
}

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
