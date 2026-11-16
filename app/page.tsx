import Link from "next/link";
import { connection } from "next/server";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { SiteHeader } from "@/components/site-header";
import { EventList, type EventListItem } from "@/components/event-list";
import { Mascot } from "@/components/mascot/mascot";
import { TAGLINE } from "@/components/brand";
import { communityLogoUrl, getListedEvents, getRequestNow, getViewer, type EventState } from "@/lib/data";
import { eventPath, splitHomeEvents } from "@/lib/event-routes";

export const metadata = { title: { absolute: "mühür" } };

/** Satır için yalnızca herkese açık alanlar (askı gerekçesi vb. listeye taşınmaz). */
function item(e: EventState, href: string): EventListItem {
  return {
    id: e.id, href, title: e.title, communityName: e.brand.communityName ?? e.communityName, communityCity: e.communityCity,
    logoUrl: communityLogoUrl(e.brand.logoPath),
    startsAt: e.startsAt, deadline: e.deadline, sealTime: e.sealTime,
  };
}

function SectionHead({ id, title, aside }: { id: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-ink pt-5 pb-1">
      <h2 id={id} className="text-[1.125rem] font-semibold">{title}</h2>
      {aside}
    </div>
  );
}

/**
 * Platform ana sayfası: açık etkinlikler (son teslime göre) ve geçmiş sergiler.
 * Yalnızca onaylı topluluğun askıda olmayan etkinlikleri listelenir. Kilidi işçi ve etkinlik sayfası yazar; bu sayfa yazmaz.
 */
export default async function PlatformHome() {
  await connection();
  const [viewer, events] = await Promise.all([getViewer(), getListedEvents()]);
  const now = getRequestNow();
  const { active, past } = splitHomeEvents(events, now);

  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1240px] flex-1 px-5 pt-14 pb-28 sm:px-8 md:pt-20">
        <div className="flex items-end justify-between gap-8">
          <div>
            <h1 className="max-w-[14ch] text-[clamp(2.25rem,6.4vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-balance">{TAGLINE}</h1>
            <p className="mt-5 max-w-[56ch] text-[1.125rem] text-ink-2">Hackathon teslimlerini sunucuda mühürleyen platform.</p>
          </div>
          <Mascot mood="normal" title="" className="hidden w-36 shrink-0 sm:block md:w-44" />
        </div>

        <section aria-labelledby="aktif" className="mt-16 md:mt-24">
          <SectionHead id="aktif" title="Aktif etkinlikler" aside={active.length > 0 && <span className="text-[0.9375rem] text-ink-2"><span className="tnum">{active.length}</span> açık</span>} />
          {active.length > 0 ? (
            <EventList kind="active" now={now} events={active.map((e) => item(e, eventPath(e.slug)))} />
          ) : (
            <p className="border-b border-rule py-6 text-ink-2">Şu an aktif etkinlik yok.</p>
          )}
        </section>

        <section aria-labelledby="gecmis" className="mt-16">
          <SectionHead
            id="gecmis"
            title="Geçmiş etkinlikler · sergiler"
            aside={
              <Link href="/sergiler" className="inline-flex items-center gap-1.5 text-[0.9375rem] text-ink-2 hover:text-ink">
                Tüm sergiler <ArrowRightIcon size={14} />
              </Link>
            }
          />
          {past.length > 0 ? (
            <EventList kind="past" now={now} events={past.map((e) => item(e, `/sergi/${e.slug}`))} />
          ) : (
            <p className="border-b border-rule py-6 text-ink-2">Henüz mühürlenmiş sergi yok.</p>
          )}
        </section>
      </main>
    </>
  );
}
