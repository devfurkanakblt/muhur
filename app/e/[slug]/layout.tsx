import { EventSurface, surfaceProps } from "@/components/event-surface";
import { requireEventBySlug } from "@/lib/data";

/**
 * Etkinliğin bütün yüzeyleri: bilinmeyen slug 404. Etkinlik rengi, sürprizler ve gizem penceresi
 * (Ctrl/Cmd+Shift+S) bu etkinliğin bayraklarına bağlıdır; gizem bu etkinliğe yazar.
 */
export default async function EventLayout({ children, params }: LayoutProps<"/e/[slug]">) {
  const { slug } = await params;
  const event = await requireEventBySlug(slug);
  return <EventSurface {...surfaceProps(event)}>{children}</EventSurface>;
}
