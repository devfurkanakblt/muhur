import Link from "next/link";
import { connection } from "next/server";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { SiteHeader } from "@/components/site-header";
import { getEvents, getViewer } from "@/lib/data";
import { formatDay } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Sergiler" };

export default async function Exhibitions() {
  await connection();
  const [viewer, events] = await Promise.all([getViewer(), getEvents()]);
  const db = createAdminClient();
  const { data: rows } = await db.from("projects").select("event_id");
  const counts = new Map<string, number>();
  for (const r of rows ?? []) counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1);

  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1240px] flex-1 px-5 pt-14 pb-28 sm:px-8 md:pt-20">
        <h1 className="text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]">Sergiler</h1>
        <p className="mt-3 max-w-[56ch] text-[1.125rem] text-ink-2">
          DEÜ CS&amp;AI hackathonlarında mühürlenen her eser burada kalır.
        </p>
        <ol className="mt-14 divide-y divide-rule border-y border-ink">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={e.isCurrent ? "/" : `/sergi/${e.slug}`} className="group grid items-baseline gap-2 py-6 sm:grid-cols-[1fr_auto_auto] sm:gap-10">
                <span className="text-[1.375rem] font-semibold tracking-[-0.015em] group-hover:underline">{e.title}</span>
                <span className="text-ink-2">
                  {formatDay(e.startsAt)} · <span className="tnum">{counts.get(e.id) ?? 0}</span> eser
                </span>
                <span className="inline-flex items-center gap-2 text-[0.9375rem] text-ink-2">
                  {e.isCurrent ? (e.locked ? "Mühürlendi" : "Şu an açık") : "Sergiyi gez"}
                  <ArrowRightIcon size={16} />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
