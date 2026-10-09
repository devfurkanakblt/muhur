import Link from "next/link";
import { after, connection } from "next/server";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
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
  const { items, voting, own } = await buildVitrine(event, viewer);
  const status = await getLiveStatus();

  // Zamanlayıcı henüz çalışmadıysa, son tarihten sonraki ilk ziyaret kilidi yazar ve mühürlemeyi başlatır.
  if (event.locked && !event.lockedAt) {
    after(async () => {
      if (await ensureLocked(event.id, "otomatik")) await freezeAll(event.id);
    });
  }

  const action = own ? (
    <Link href="/panel" className={buttonStyles.primary}>
      Projeme git
      <ArrowRightIcon size={16} />
    </Link>
  ) : viewer ? (
    <Link href="/panel" className={buttonStyles.primary}>
      Projeni içe aktar
      <ArrowRightIcon size={16} />
    </Link>
  ) : (
    <SignInButton />
  );

  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <LiveState version={status.version} />
        <Hero
          key={event.id}
          startsAt={event.startsAt}
          deadline={event.deadline}
          sealTime={event.sealTime}
          locked={event.locked}
          serverNow={event.now}
          login={viewer?.login ?? null}
          action={action}
        />
        <Vitrine key={event.id} items={items} voting={voting} locked={event.locked} sealTime={event.sealTime} />
      </main>
    </>
  );
}
