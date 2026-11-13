import { randomUUID } from "node:crypto";
import { getViewer } from "@/lib/data";
import { env } from "@/lib/env";
import { UUID } from "@/lib/community-input";
import { getApplicationPolicies } from "@/lib/community";
import { CommunityLayout } from "@/components/community-layout";
import { ApplicationForm } from "@/components/community-forms";
import { SignInButton } from "@/components/buttons";
export const metadata = { title: "Topluluğunu kaydet" };
export default async function Page({ searchParams }: PageProps<"/topluluk/basvur">) {
 const viewer = await getViewer(); const params = await searchParams;
 const previous = typeof params.onceki === "string" && UUID.test(params.onceki) ? params.onceki : "";
 const policies = env.communityApplicationsEnabled && viewer?.githubId ? await getApplicationPolicies() : [];
 return <CommunityLayout viewer={viewer} title="Topluluğunu kaydet" note="Başvurun incelendikten sonra hackathonlarını topluluğun adına yönetebilirsin.">
 {!env.communityApplicationsEnabled ? <p className="max-w-[60ch] text-ink-2">Topluluk başvuruları henüz açılmadı. Açıldığında bu sayfadan başvurabilirsin.</p> : !viewer?.githubId ? <SignInButton next="/topluluk/basvur" label="GitHub ile giriş yap ve başvur" /> : policies.length !== 2 ? <p className="text-ink-2">Başvuru belgeleri hazırlanıyor. Daha sonra tekrar gel.</p> : <ApplicationForm policies={policies} requestId={randomUUID()} previousId={previous} />}
 </CommunityLayout>;
}
