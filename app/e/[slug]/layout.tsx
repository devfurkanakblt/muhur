import { MysteryEgg } from "@/components/mystery-egg";
import { requireEventBySlug } from "@/lib/data";

/** Etkinliğin bütün yüzeyleri: bilinmeyen slug 404; gizem penceresi (Ctrl/Cmd+Shift+S) bu etkinliğe yazar. */
export default async function EventLayout({ children, params }: LayoutProps<"/e/[slug]">) {
  const { slug } = await params;
  const event = await requireEventBySlug(slug);
  return (
    <>
      {children}
      <MysteryEgg eventId={event.id} />
    </>
  );
}
