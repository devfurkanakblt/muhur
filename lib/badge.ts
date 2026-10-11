/**
 * README rozeti: "mühür. | vitrinde" ya da "mühür. | 3f9a2c1".
 * Metin genişlikleri 11px Verdana/DejaVu ölçülerine göre yaklaşık hesaplanır (shields.io ile aynı yaklaşım).
 */
function width(text: string) {
  return Math.round([...text].reduce((w, ch) => w + (/[ilj.:|' ]/.test(ch) ? 3.6 : /[mwMW]/.test(ch) ? 10 : 7), 0) + 12);
}

export function badge(right: string, color: string) {
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
