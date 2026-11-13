import Link from "next/link";
import { after, connection } from "next/server";
import { ArrowDownIcon, ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { Hero } from "@/components/hero";
import { Vitrine } from "@/components/vitrine";
import { SiteHeader } from "@/components/site-header";
import { SignInButton } from "@/components/buttons";
import { buttonStyles } from "@/components/button-styles";
import { getViewer, requireEventBySlug } from "@/lib/data";
import { eventPath } from "@/lib/event-routes";
import { buildVitrine } from "@/lib/vitrine";
import { ensureLocked, freezeAll } from "@/lib/freeze";
import { getLiveStatus } from "@/lib/status";
import { LiveState } from "@/components/live-state";
import { askiBilgisi, gorunenEtkinlik, SuspensionNotice } from "@/components/suspension-notice";
import { getEventAccess } from "@/lib/access";
import { can } from "@/lib/authz";

export async function generateMetadata({ params }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  const event = await requireEventBySlug(slug);
  return { title: { absolute: `${event.title} · mühür` } };
}

/** Etkinlik vitrini ve geri sayım. */
export default async function EventHome({ params }: PageProps<"/e/[slug]">) {
  await connection();
  const { slug } = await params;
  const [loaded, viewer] = await Promise.all([requireEventBySlug(slug), getViewer()]);
  // Askı gerekçesi yalnızca etkinliği inceleyebilenlere; yetki sorgusu yalnızca askıdayken yapılır.
  const showReason = loaded.suspended && can(await getEventAccess(viewer, loaded), "incele");
  const event = gorunenEtkinlik(loaded, showReason);
  const { items, voting, own, winners } = await buildVitrine(event, viewer);
  const status = await getLiveStatus(event);

  // Zamanlayıcı henüz çalışmadıysa, son tarihten sonraki ilk ziyaret kilidi yazar ve mühürlemeyi başlatır.
  if (event.locked && !event.lockedAt) {
    after(async () => {
      if (await ensureLocked(event.id, "otomatik")) await freezeAll(event.id);
    });
  }

  // Kazananlar açıklandıysa sayfanın ana eylemi onlara gitmektir; panel bağlantısı ikinci planda kalır.
  const announced = winners.length > 0;
  const panel = own ? (
    <Link href={eventPath(event.slug, "panel")} className={announced ? buttonStyles.ghost : buttonStyles.primary}>
      Projeme git
      <ArrowRightIcon size={16} />
    </Link>
  ) : viewer ? (
    <Link href={eventPath(event.slug, "panel")} className={announced ? buttonStyles.ghost : buttonStyles.primary}>
      Projeni içe aktar
      <ArrowRightIcon size={16} />
    </Link>
  ) : announced ? null : (
    <SignInButton next={eventPath(event.slug, "panel")} />
  );
  const action = announced ? (
    <div className="flex flex-wrap gap-3">
      <Link href="#kazananlar" className={buttonStyles.primary}>
        Kazananları gör
        <ArrowDownIcon size={16} />
      </Link>
      {panel}
    </div>
  ) : panel;

  return (
    <>
      <SiteHeader viewer={viewer} event={event} />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <LiveState slug={event.slug} version={status.version} />
        <p className="mx-auto w-full max-w-[1240px] px-5 pt-6 text-[0.8125rem] text-ink-3 sm:px-8">
          {event.communityName && <><span>{event.communityName}</span><span className="mx-2 text-rule-strong">·</span></>}
          <span className="text-ink-2">{event.title}</span>
        </p>
        {event.suspended && (
          <div className="mx-auto w-full max-w-[1240px] px-5 pt-6 sm:px-8">
            <SuspensionNotice event={askiBilgisi(event, showReason)} showReason={showReason} />
          </div>
        )}
        <Hero
          key={`hero-${event.id}`}
          startsAt={event.startsAt}
          deadline={event.deadline}
          sealTime={event.sealTime}
          locked={event.locked}
          serverNow={event.now}
          login={viewer?.login ?? null}
          activity={event.activity}
          action={action}
          celebrate={announced}
        />
        {(event.applicationUrl || event.rulesUrl || event.privacyUrl) && <nav aria-label="Etkinlik belgeleri" className="wrap flex flex-wrap gap-x-6 gap-y-3 py-5 text-sm text-ink-muted">
          {event.applicationUrl && <a href={event.applicationUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Başvuru formu ↗</a>}
          {event.rulesUrl && <a href={event.rulesUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Etkinlik kuralları ↗</a>}
          {event.privacyUrl && <a href={event.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Aydınlatma metni ↗</a>}
        </nav>}
        <Vitrine key={`vitrin-${event.id}`} eventId={event.id} items={items} voting={voting} winners={winners} locked={event.locked} sealTime={event.sealTime} />
      </main>
    </>
  );
}
