import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Wordmark } from "@/components/brand";
import { Mascot } from "@/components/mascot/mascot";
import { SealRecord } from "@/components/seal-record";
import { PrintButton } from "@/components/print-button";
import { getEventBySlug, getExhibit, getMembers } from "@/lib/data";
import { exhibitNo } from "@/lib/format";
import { env } from "@/lib/env";

export const metadata = { title: "Mühür makbuzu" };

export default async function ReceiptPage({ params }: PageProps<"/sergi/[slug]/[no]/makbuz">) {
  await connection();
  const { slug, no } = await params;
  const event = await getEventBySlug(slug);
  const exhibit = event ? await getExhibit(event.id, Number(no)) : null;
  if (!event || !exhibit || !event.locked || !exhibit.frozen_sha || !exhibit.archive_sha256) notFound();
  const members = await getMembers(exhibit.id);
  const verifyUrl = `${env.siteUrl}/dogrula`;

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[760px] flex-1 px-5 py-12 sm:px-8 print:max-w-none print:p-0">
      <div className="flex items-start justify-between gap-6 border-b border-ink pb-6">
        <div>
          <Wordmark className="text-[2rem] leading-none" />
          <p className="mt-2 text-[0.6875rem] font-medium tracking-[0.1em] text-ink-3 uppercase">Mühür makbuzu</p>
        </div>
        <Mascot mood="uykulu" title="" className="w-20 shrink-0" />
      </div>

      <div className="mt-8">
        <p className="font-mono text-[0.8125rem] text-ink-3 tnum">
          {exhibitNo(exhibit.exhibit_no)} · {event.title}
        </p>
        <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.02em]">{exhibit.name}</h1>
        <p className="mt-1 text-[1.125rem] text-ink-2">
          {exhibit.team_name} · {members.map((m) => m.github_login).join(", ")}
        </p>
      </div>

      <div className="mt-8">
        <SealRecord project={exhibit} sealTime={event.sealTime} print />
      </div>

      <p className="mt-8 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-2">
        Bu makbuz, eserin yukarıdaki commit üzerinden mühürlendiğini kayıt altına alır. Mühürlü arşivin SHA-256 özeti, arşivin bir baytı bile
        değişirse farklı çıkar. Doğrulamak için arşivi {verifyUrl} adresine bırakmak yeterli.
      </p>

      <div className="no-print mt-10">
        <Link href={`/sergi/${slug}/${no}`} className="mr-6 inline-flex min-h-11 items-center underline">Esere dön</Link>
        <Link href="/dogrula" className="mr-6 inline-flex min-h-11 items-center underline">Mührü doğrula</Link>
        <PrintButton />
      </div>
    </main>
  );
}
