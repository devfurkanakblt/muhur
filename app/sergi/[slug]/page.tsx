import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { eventShowsMascot } from "@/lib/event-features";
import { Vitrine } from "@/components/vitrine";
import { getEventBySlug, getViewer } from "@/lib/data";
import { buildVitrine } from "@/lib/vitrine";
import { formatDay } from "@/lib/format";
import { askiBilgisi, gorunenEtkinlik, SuspensionNotice } from "@/components/suspension-notice";
import { getEventAccess } from "@/lib/access";
import { can } from "@/lib/authz";
import { eventPath } from "@/lib/event-routes";

export async function generateMetadata({ params }: PageProps<"/sergi/[slug]">) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  return { title: event?.title ?? "Sergi bulunamadı" };
}

/** Geçmiş sergiler: kapanmış vitrin, mühürler ve halkın seçimi sonucu. Kilidi vurulmamış etkinlik kendi vitrinindedir. */
export default async function PastExhibition({ params }: PageProps<"/sergi/[slug]">) {
  await connection();
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  if (event.lockedAt == null) redirect(eventPath(event.slug));
  const viewer = await getViewer();
  const { items, voting, winners } = await buildVitrine(event, viewer);
  const showReason = event.suspended && can(await getEventAccess(viewer, event), "incele");

  return (
    <>
      <SiteHeader viewer={viewer} event={gorunenEtkinlik(event, showReason)} />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <div className="mx-auto w-full max-w-[1240px] px-5 pt-14 pb-14 sm:px-8 md:pt-20">
          <h1 className="text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]">{event.title}</h1>
          <p className="mt-3 text-[1.125rem] text-ink-2">
            Geçmiş sergi · {formatDay(event.startsAt)} – {formatDay(event.sealTime)} · <span className="tnum">{items.length}</span> eser
          </p>
          <SuspensionNotice event={askiBilgisi(event, showReason)} showReason={showReason} className="mt-8" />
        </div>
        <Vitrine mascot={eventShowsMascot(event)} eventId={event.id} items={items} voting={voting} winners={winners} locked={event.locked} sealTime={event.sealTime} live={false} />
      </main>
    </>
  );
}
