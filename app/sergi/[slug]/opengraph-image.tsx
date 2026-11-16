import { eventOgImage } from "@/lib/event-og";

export const alt = "mühür. etkinlik kartı";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Etkinliğin paylaşım kartı: topluluk markasıyla; DEÜ maskotu yalnız maskotun topluluğunda. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return eventOgImage(slug);
}
