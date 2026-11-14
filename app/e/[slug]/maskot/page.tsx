import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { requireEventBySlug } from "@/lib/data";
import { eventPath } from "@/lib/event-routes";
import { getMascotNamingSnapshot, hasMascotNaming } from "@/lib/mascot-naming";
import { NamingExperience } from "./naming-experience";
import "./maskot.css";

export async function generateMetadata({ params }: PageProps<"/e/[slug]/maskot">) {
  const { slug } = await params;
  const event = await requireEventBySlug(slug);
  return {
    title: { absolute: `${event.title} · mühür` },
    description: `${event.communityName ?? "Topluluk"} maskotuna isim öner, halk oylamasına katıl ve sonuçları canlı izle.`,
  };
}

export default async function MascotNamingPage({ params }: PageProps<"/e/[slug]/maskot">) {
  await connection();
  const { slug } = await params;
  const event = await requireEventBySlug(slug);
  // Maskot DEÜ CS&AI'nin; başka toplulukların etkinliklerinde bu yüzey yoktur.
  if (!hasMascotNaming(event)) notFound();
  const snapshot = await getMascotNamingSnapshot(event);
  return <>
    <header className="naming-header">
      <Link href={eventPath(event.slug)} aria-label={`${event.title} vitrini`}>
        <Wordmark className="text-[1.375rem]" />
      </Link>
    </header>
    <main id="main-content" tabIndex={-1} className="naming-page flex-1">
      <NamingExperience eventId={event.id} slug={event.slug} initial={snapshot} />
    </main>
    <div className="naming-legal"><Link href="/gizlilik">Aydınlatma metni</Link></div>
  </>;
}
