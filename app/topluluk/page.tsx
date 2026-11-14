import Link from "next/link";
import { getManagedCommunities, getViewer } from "@/lib/data";
import { CommunityLayout } from "@/components/community-layout";
import { SignInButton } from "@/components/buttons";
export const metadata = { title: "Topluluklarım" };
export default async function Page() {
 const viewer = await getViewer(); const communities = viewer ? await getManagedCommunities(viewer.id) : [];
 return <CommunityLayout viewer={viewer} title="Topluluklarım" note="Etkinliklerini yönettiğin topluluklar ve başvuruların.">
 {!viewer ? <SignInButton next="/topluluk" label="GitHub ile giriş yap" /> : <><ul className="divide-y divide-rule border-y border-rule">{communities.map(c => <li key={c.id} className="py-5"><Link className="font-medium underline underline-offset-4" href={`/topluluk/${c.slug}`}>{c.name}</Link><p className="mt-2 text-sm text-ink-2">{c.role === "owner" ? "Topluluk sahibi" : "Organizatör"} · {c.status}</p></li>)}</ul>{!communities.length && <p className="text-ink-2">Henüz bir topluluğun üyesi değilsin.</p>}<Link className="underline underline-offset-4" href="/topluluk/basvurularim">Başvurularım</Link><Link className="underline underline-offset-4" href="/topluluk/basvur">Topluluk başvurusu</Link></>}
 </CommunityLayout>;
}
