import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSession, getViewer } from "@/lib/data";
import { getAdminCommunityPage } from "@/lib/community";
import { CommunityLayout } from "@/components/community-layout";
import { CommunityRoleForm, ReviewApplicationForm } from "@/components/community-forms";
import { formatDateTime } from "@/lib/format";
export const metadata = { title: "Topluluk başvuruları" };
export default async function Page({ searchParams }: PageProps<"/yonetim/topluluklar">) {
 const viewer = await getViewer(); if(!viewer?.isHeadAdmin) notFound(); const params = await searchParams;
 const raw = Number(params.sayfa ?? 0), page = Number.isSafeInteger(raw) && raw >= 0 && raw <= 100000 ? raw : 0;
 const [result,session] = await Promise.all([getAdminCommunityPage(viewer,page),getAdminSession()]);
 return <CommunityLayout viewer={viewer} title="Topluluklar ve başvurular" note="Başvuruları incele, toplulukları askıya al veya kaybolan sahip erişimini gerekçeyle yeniden ata. Bu işlemler denetim kaydına yazılır.">
 {!session?.fresh && <p className="text-danger">İşlem yapmadan önce GitHub ile yeniden giriş yapmalısın. Yönetim merkezindeki oturum düğmesini kullan.</p>}
 {!result.items.length && <p className="text-ink-2">Bu sayfada topluluk yok.</p>}
 <div className="grid gap-14">{result.items.map(c => <article key={c.id} className="grid gap-6 border-t border-rule pt-7"><div><h2 className="text-2xl font-semibold">{c.name}</h2><p className="mt-2 text-sm text-ink-2">{c.status} · {formatDateTime(c.created_at)}</p></div>
 <dl className="grid gap-2 text-sm sm:grid-cols-[180px_1fr]"><dt className="text-ink-3">Kurum / şehir</dt><dd>{[c.university,c.city].filter(Boolean).join(" · ") || "Belirtilmedi"}</dd><dt className="text-ink-3">Sorumlu</dt><dd>{c.contact_name || "Belirtilmedi"}</dd><dt className="text-ink-3">E-posta / telefon</dt><dd className="break-all">{c.contact_email} · {c.contact_phone}</dd></dl>
 {c.status === "beklemede" ? <ReviewApplicationForm communityId={c.id} /> : c.status === "reddedildi" ? <p className="text-ink-2">Ret gerekçesi: {c.review_reason}</p> : <div className="grid gap-7"><Link className="underline underline-offset-4" href={`/topluluk/${c.slug}`}>Topluluğu incele</Link><CommunityRoleForm scope={c.id} operation={c.status === "askida" ? "unsuspend" : "suspend"} label={c.status === "askida" ? "Askıyı kaldır" : "Topluluğu askıya al"} /><details className="max-w-[600px]"><summary className="cursor-pointer py-3 underline underline-offset-4">Sahip hesabını kurtar</summary><p className="my-4 text-sm text-ink-2">Hedef kullanıcı UUID’si doğrulanmış GitHub hesabına ait olmalı. Eski sahip organizatör olur.</p><CommunityRoleForm scope={c.id} operation="recover" label="Yeni sahibi ata" /></details></div>}
 </article>)}</div>
 <nav aria-label="Topluluk sayfaları" className="flex gap-6">{page>0 && <Link className="underline" href={`?sayfa=${page-1}`}>Önceki sayfa</Link>}{(page+1)*20<result.count && <Link className="underline" href={`?sayfa=${page+1}`}>Sonraki sayfa</Link>}</nav>
 </CommunityLayout>;
}
