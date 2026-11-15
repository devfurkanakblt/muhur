import { getViewer } from "@/lib/data";
import { getRoleInvite } from "@/lib/community";
import { CommunityLayout } from "@/components/community-layout";
import { AcceptRoleInviteForm } from "@/components/community-forms";
import { SignInButton } from "@/components/buttons";
import { getManagementDocuments } from "@/lib/policy-data";
export const metadata = { title: "Rol daveti", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page({ params }: PageProps<"/katil/[token]">) {
 const { token } = await params; const [viewer, invitation] = await Promise.all([getViewer(),getRoleInvite(token)]);
 const documents = viewer && invitation?.kind === "organizator" ? await getManagementDocuments() : [];
 return <CommunityLayout viewer={viewer} title={invitation ? `${invitation.title} seni davet ediyor.` : "Bu davet kullanılamıyor."} note={invitation ? `${invitation.kind === "juri" ? "Jüri" : "Organizatör"} daveti. Rolü kabul etmek için kendi hesabınla giriş yapmalısın.` : "Bağlantı geçersiz, kullanılmış, iptal edilmiş veya süresi dolmuş olabilir. Davet eden kişiden yeni bağlantı iste."}>
 {invitation && <div className="grid max-w-[60ch] justify-items-start gap-6"><p className="leading-relaxed text-ink-2">{invitation.kind === "juri" ? "Bu etkinliğin mühürlü arşivlerini inceleyebilirsin; aynı etkinlikte yarışamaz ve halk oylamasına katılamazsın." : "Topluluğun etkinliklerini yönetebilirsin; topluluğun açık etkinliğinde yarışan hesap daveti kabul edemez."}</p>
 {!viewer ? <div className="flex flex-wrap gap-4"><SignInButton next={`/katil/${token}`} label="GitHub ile giriş yap" />{invitation.kind === "juri" && <SignInButton provider="linkedin_oidc" next={`/katil/${token}`} label="LinkedIn ile giriş yap" />}</div> : invitation.kind === "organizator" && !viewer.githubId ? <SignInButton next={`/katil/${token}`} label="GitHub ile giriş yap" /> : <AcceptRoleInviteForm token={token} documents={documents} />}
 </div>}
 </CommunityLayout>;
}
