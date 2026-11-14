import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer, requireEventBySlug, getExhibits } from "@/lib/data";
import { getEventAccess } from "@/lib/access";
import { can } from "@/lib/authz";
import { SiteHeader } from "@/components/site-header";
export async function generateMetadata({ params }: PageProps<"/e/[slug]/juri">) { const {slug}=await params; const event=await requireEventBySlug(slug); return {title:`Jüri · ${event.title}`}; }
export default async function Page({ params }: PageProps<"/e/[slug]/juri">) {
 const {slug}=await params; const [viewer,event]=await Promise.all([getViewer(),requireEventBySlug(slug)]); const access=await getEventAccess(viewer,event);
 if(!viewer || !access || !(access.juror || can(access,"incele"))) notFound();
 const exhibits=event.locked && can(access,"juri-paketi") ? await getExhibits(event.id) : [];
 return <><SiteHeader viewer={viewer} event={event} /><main id="main-content" tabIndex={-1} className="mx-auto grid w-full max-w-[1240px] flex-1 content-start gap-10 px-5 pt-10 pb-28 sm:px-8 md:pt-16"><div><h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold tracking-[-0.02em]">Jüri incelemesi</h1><p className="mt-3 text-ink-2">{event.title} · Yalnızca bu etkinliğin teslimleri.</p></div>
 {event.suspended && !can(access,"juri-paketi") ? <p className="text-ink-2">Etkinlik geçici olarak durduruldu. İnceleme yeniden açıldığında burada görünecek.</p> : !event.locked ? <p className="max-w-[60ch] text-ink-2">Arşivler mühür vurulduktan sonra açılır. Teslim süresi henüz dolmadı.</p> : <><div className="flex flex-wrap gap-6"><a className="underline underline-offset-4" href={`/api/juri/${slug}?paket=gecerli`}>Mühürlü teslimleri ZIP indir</a><a className="underline underline-offset-4" href={`/api/juri/${slug}?format=csv`}>Teslim listesi CSV</a></div><ul className="divide-y divide-rule border-y border-rule">{exhibits.map(p=><li key={p.id} className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto]"><div><Link className="font-medium underline underline-offset-4" href={`/sergi/${slug}/${p.exhibit_no}`}>{p.name}</Link><p className="mt-2 text-sm text-ink-2">{p.team_name}</p></div>{p.archive_sha256 ? <a className="underline underline-offset-4" href={`/api/arsiv/${p.id}`}>Arşivi indir</a> : <span className="text-sm text-ink-3">Mühürlü teslim yok.</span>}</li>)}</ul>{!exhibits.length&&<p className="text-ink-2">Henüz teslim kaydı yok.</p>}</>}
 </main></>;
}
