import { EventSurface, surfaceProps } from "@/components/event-surface";
import { getEventBySlug } from "@/lib/data";

/** Sergi, eser ve makbuz sayfaları da etkinlik yüzeyidir: aynı renk kapsamı ve aynı özellik bayrakları. */
export default async function ExhibitionLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  // Bilinmeyen slug: sayfa kendi notFound kararını verir; burada platform görünümü kalır.
  return event ? <EventSurface {...surfaceProps(event)}>{children}</EventSurface> : <>{children}</>;
}
