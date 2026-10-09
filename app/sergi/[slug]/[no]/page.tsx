import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeftIcon, ArrowUpRightIcon, ReceiptIcon } from "@phosphor-icons/react/ssr";
import { SiteHeader } from "@/components/site-header";
import { Plinth } from "@/components/exhibit-label";
import { SealRecord } from "@/components/seal-record";
import { VoteButton } from "@/components/vote-button";
import { LiveState } from "@/components/live-state";
import { getEventBySlug, getExhibit, getMembers, getOwnProject, getViewer, getVotes, getAwards, logoUrl } from "@/lib/data";
import { exhibitNo, formatDateTime } from "@/lib/format";

async function load(slug: string, no: string) {
  const event = await getEventBySlug(slug);
  const n = Number(no);
  if (!event || !Number.isInteger(n)) return null;
  const exhibit = await getExhibit(event.id, n);
  return exhibit ? { event, exhibit } : null;
}

export async function generateMetadata({ params }: PageProps<"/sergi/[slug]/[no]">) {
  const { slug, no } = await params;
  const data = await load(slug, no);
  if (!data) return { title: "Eser bulunamadı" };
  return {
    title: `${data.exhibit.name} · ${data.exhibit.team_name}`,
    description: data.exhibit.summary,
  };
}

export default async function ExhibitPage({ params }: PageProps<"/sergi/[slug]/[no]">) {
  await connection();
  const { slug, no } = await params;
  const data = await load(slug, no);
  if (!data) notFound();
  const { event, exhibit } = data;
  const [viewer, members] = await Promise.all([getViewer(), getMembers(exhibit.id)]);
  const [votes, own] = await Promise.all([getVotes(event, viewer?.id ?? null), viewer ? getOwnProject(viewer.id, event.id) : null]);
  const back = event.isCurrent ? "/#vitrin" : `/sergi/${event.slug}`;
  const awards = (await getAwards(event.id)).filter(a => a.project_id === exhibit.id);

  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1240px] flex-1 px-5 pt-10 pb-28 sm:px-8 md:pt-16">
        {event.isCurrent && <LiveState />}
        <Link href={back} className="mb-10 inline-flex items-center gap-1.5 text-[0.9375rem] text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={16} /> {event.isCurrent ? "Vitrine dön" : event.title}
        </Link>

        <div className="grid gap-12 md:grid-cols-[minmax(0,320px)_1fr] md:gap-20">
          <div>
            <Plinth src={logoUrl(exhibit.logo_path)} alt={`${exhibit.name} logosu`} />
          </div>

          <div className="min-w-0">
            <p className="font-mono text-[0.8125rem] text-ink-3 tnum">
              {exhibitNo(exhibit.exhibit_no)} · {event.title}
            </p>
            <h1 className="mt-3 text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-balance">{exhibit.name}</h1>
            <p className="mt-2 text-[1.25rem] text-ink-2">{exhibit.team_name}</p>
            <p className="mt-8 max-w-[60ch] text-[1.125rem] leading-relaxed">{exhibit.summary}</p>
            {awards.length > 0 && <section className="mt-8 border-y border-rule py-4" aria-label="Jüri ödülleri">
              {awards.map(a => <div key={a.id} className="py-2"><h2 className="font-semibold text-indigo">★ {a.title}</h2><p className="mt-1 text-ink-2">{a.reason}</p></div>)}
            </section>}

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a href={exhibit.repo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[0.875rem] text-ink hover:underline">
                {exhibit.repo_full_name}
                <ArrowUpRightIcon size={14} />
              </a>
              {exhibit.demo_url && <a href={exhibit.demo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[0.875rem] text-indigo hover:underline">Demoyu aç <ArrowUpRightIcon size={14} /></a>}
              {event.voting === "acik" && (
                <VoteButton projectId={exhibit.id} voted={votes.myVote === exhibit.id} own={own?.id === exhibit.id} signedIn={!!viewer} />
              )}
              {votes.tallies && (
                <p className="text-ink-2">
                  Halkın seçimi: <span className="tnum font-medium text-ink">{votes.tallies[exhibit.id] ?? 0}</span> oy
                </p>
              )}
            </div>

            <section className="mt-14 border-t border-ink pt-5">
              <h2 className="text-[1.125rem] font-semibold">Ekip</h2>
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                {members.map((m) => (
                  <li key={m.user_id}>
                    <a href={`https://github.com/${m.github_login}`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 hover:underline">
                      {m.avatar_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.avatar_url} alt="" className="h-7 w-7 rounded-full border border-rule" />
                      )}
                      {m.github_login}
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-14 border-t border-ink pt-5">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[1.125rem] font-semibold">Mühür</h2>
                {exhibit.archive_sha256 && (
                  <Link href={`/sergi/${event.slug}/${exhibit.exhibit_no}/makbuz`} className="inline-flex items-center gap-2 text-[0.9375rem] hover:underline">
                    <ReceiptIcon size={18} /> Makbuz
                  </Link>
                )}
              </div>
              {event.locked ? (
                <SealRecord project={exhibit} sealTime={event.sealTime} />
              ) : (
                <p className="text-ink-2">Teslim {formatDateTime(event.deadline)} anında kapanacak. Ekip, son push&apos;tan sonra teslim sürümünü panelden güncellemelidir.</p>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
