import Link from "next/link";
import { after, connection } from "next/server";
import { ArrowDownIcon, ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { Hero } from "@/components/hero";
import { Vitrine } from "@/components/vitrine";
import { SiteHeader } from "@/components/site-header";
import { SignInButton } from "@/components/buttons";
import { buttonStyles } from "@/components/button-styles";
import { getEvent, getViewer } from "@/lib/data";
import { buildVitrine } from "@/lib/vitrine";
import { ensureLocked, freezeAll } from "@/lib/freeze";
import { getLiveStatus } from "@/lib/status";
import { LiveState } from "@/components/live-state";

export default async function Home() {
  await connection();
  const [event, viewer] = await Promise.all([getEvent(), getViewer()]);
  const { items, voting, own, winners } = await buildVitrine(event, viewer);
  const status = await getLiveStatus();

  // Zamanlayıcı henüz çalışmadıysa, son tarihten sonraki ilk ziyaret kilidi yazar ve mühürlemeyi başlatır.
  if (event.locked && !event.lockedAt) {
    after(async () => {
      if (await ensureLocked(event.id, "otomatik")) await freezeAll(event.id);
    });
  }

  // Kazananlar açıklandıysa sayfanın ana eylemi onlara gitmektir; panel bağlantısı ikinci planda kalır.
  const announced = winners.length > 0;
  const panel = own ? (
    <Link href="/panel" className={announced ? buttonStyles.ghost : buttonStyles.primary}>
      Projeme git
      <ArrowRightIcon size={16} />
    </Link>
  ) : viewer ? (
    <Link href="/panel" className={announced ? buttonStyles.ghost : buttonStyles.primary}>
      Projeni içe aktar
      <ArrowRightIcon size={16} />
    </Link>
  ) : announced ? null : (
    <SignInButton />
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
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <LiveState version={status.version} />
        <Hero
          key={`hero-${event.id}`}
          startsAt={event.startsAt}
          deadline={event.deadline}
          sealTime={event.sealTime}
          locked={event.locked}
          serverNow={event.now}
          login={viewer?.login ?? null}
          action={action}
          celebrate={announced}
        />
        <Vitrine key={`vitrin-${event.id}`} items={items} voting={voting} winners={winners} locked={event.locked} sealTime={event.sealTime} />
      </main>
    </>
  );
}
