import { connection } from "next/server";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { getEvent } from "@/lib/data";
import { getMascotNamingSnapshot } from "@/lib/mascot-naming";
import { NamingExperience } from "./naming-experience";
import "./maskot.css";

export const metadata = {
  title: "Maskota isim ver",
  description: "DEÜ CS&AI maskotuna isim öner, halk oylamasına katıl ve sonuçları canlı izle.",
};

export default async function MascotNamingPage() {
  await connection();
  const [event, snapshot] = await Promise.all([getEvent(), getMascotNamingSnapshot()]);
  return <>
    <header className="naming-header">
      <Link href="/" aria-label="mühür ana sayfa">
        <Wordmark className="text-[1.375rem]" />
      </Link>
    </header>
    <main id="main-content" tabIndex={-1} className="naming-page flex-1">
      <NamingExperience eventId={event.id} initial={snapshot} />
    </main>
    <div className="naming-legal"><Link href="/gizlilik">Aydınlatma metni</Link></div>
  </>;
}
