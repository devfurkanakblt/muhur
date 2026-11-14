import Link from "next/link";
import { getViewer } from "@/lib/data";
import { getOwnApplications } from "@/lib/community";
import { CommunityLayout } from "@/components/community-layout";
import { SignInButton } from "@/components/buttons";
import { formatDateTime } from "@/lib/format";
export const metadata = { title: "Başvurularım" };
const status: Record<string,string> = { beklemede: "İnceleniyor", onaylandi: "Onaylandı", reddedildi: "Onaylanmadı", askida: "Geçici olarak durduruldu" };
export default async function Page() {
 const viewer = await getViewer(); const applications = viewer?.githubId ? await getOwnApplications(viewer) : [];
 return <CommunityLayout viewer={viewer} title="Başvurularım" note="Gönderdiğin bilgiler ve inceleme sonucu. Karar e-postası ulaşmasa da güncel durum burada görünür.">
 {!viewer?.githubId ? <SignInButton next="/topluluk/basvurularim" label="GitHub ile giriş yap" /> : applications.length === 0 ? <div className="grid justify-items-start gap-5"><p className="text-ink-2">Henüz bir topluluk başvurun yok.</p><Link className="underline underline-offset-4" href="/topluluk/basvur">Topluluk başvurusu yap</Link></div> : <div className="grid gap-12">{applications.map(a => <article key={a.id} className="grid gap-5 border-t border-rule pt-7"><div><h2 className="text-xl font-semibold">{a.name}</h2><p className="mt-2 text-sm text-ink-2">{status[a.status]} · {formatDateTime(a.created_at)}</p></div>
 <dl className="grid gap-2 text-[0.9375rem] sm:grid-cols-[180px_1fr]"><dt className="text-ink-3">Kurum / şehir</dt><dd>{[a.university,a.city].filter(Boolean).join(" · ") || "Belirtilmedi"}</dd><dt className="text-ink-3">Sorumlu</dt><dd>{a.contact_name}</dd><dt className="text-ink-3">E-posta</dt><dd className="break-all">{a.contact_email}</dd><dt className="text-ink-3">Telefon</dt><dd>{a.contact_phone}</dd></dl>
 {a.status === "reddedildi" && <><p className="max-w-[65ch] leading-relaxed">Gerekçe: {a.review_reason}</p><Link className="underline underline-offset-4" href={`/topluluk/basvur?onceki=${a.id}`}>Yeni bilgilerle yeniden başvur</Link></>}
 {a.status === "beklemede" && <p className="text-ink-2">Başvurun incelemede. Sonuç e-postası gönderildiğinde de bu sayfadan takip edebilirsin.</p>}
 {["onaylandi","askida"].includes(a.status) && <Link className="underline underline-offset-4" href={`/topluluk/${a.slug}`}>Topluluk panosunu aç</Link>}
 </article>)}</div>}
 </CommunityLayout>;
}
