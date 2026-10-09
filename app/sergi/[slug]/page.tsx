import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { Vitrine } from "@/components/vitrine";
import { getEventBySlug, getViewer } from "@/lib/data";
import { buildVitrine } from "@/lib/vitrine";
import { formatDay } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/sergi/[slug]">) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  return { title: event?.title ?? "Sergi bulunamadı" };
}

/** Geçmiş sergiler: kapanmış vitrin, mühürler ve halkın seçimi sonucu. Güncel etkinlik ana sayfadadır. */
export default async function PastExhibition({ params }: PageProps<"/sergi/[slug]">) {
  await connection();
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  if (event.isCurrent) redirect("/");
  const viewer = await getViewer();
  const { items, voting } = await buildVitrine(event, viewer);

  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <div className="mx-auto w-full max-w-[1240px] px-5 pt-14 pb-14 sm:px-8 md:pt-20">
          <h1 className="text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]">{event.title}</h1>
          <p className="mt-3 text-[1.125rem] text-ink-2">
            Geçmiş sergi · {formatDay(event.startsAt)} – {formatDay(event.sealTime)} · <span className="tnum">{items.length}</span> eser
          </p>
        </div>
        <Vitrine items={items} voting={voting} locked={event.locked} sealTime={event.sealTime} live={false} />
      </main>
    </>
  );
}
