import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/data";
import { getCommunityScope } from "@/lib/community";
import { getManagementConsent } from "@/lib/policy-data";
import { safeConsentNext } from "@/lib/policies";
import { CommunityLayout } from "@/components/community-layout";
import { PolicyConsentForm } from "@/components/policy-consent-form";

export const metadata = { title: "Belge onayı", robots: { index: false, follow: false } };

/**
 * Sahip/organizatör güncel platform belgelerini topluluk adına onaylar. Head admin'in platform yetkisi
 * bir topluluk adına kabul sayılmaz: rolü olmayan bu sayfayı görmez.
 */
export default async function Page({ params, searchParams }: PageProps<"/topluluk/[slug]/onay">) {
  const { slug } = await params;
  const query = await searchParams;
  const viewer = await getViewer();
  const scope = await getCommunityScope(viewer, slug);
  if (!viewer || !scope?.role) notFound();
  const back = `/topluluk/${scope.community.slug}`;
  const next = safeConsentNext(query.next, back);
  const consent = await getManagementConsent(viewer.id, scope.community.id);
  return (
    <CommunityLayout viewer={viewer} title="Platform belgelerini onayla" note={`${scope.community.name} adına yönetim işlemleri yapabilmek için güncel belgeleri ayrı ayrı onaylaman gerekiyor. Onayın sürüm ve tarihle kayda geçer; sonradan değiştirilemez.`}>
      {!consent.configured ? (
        <p className="max-w-[60ch] leading-relaxed text-ink-2">Platform belgeleri henüz yayınlanmadı. Yayınlandığında bu sayfadan onaylayabilirsin.</p>
      ) : consent.missing.length === 0 ? (
        <div className="grid max-w-[60ch] justify-items-start gap-4">
          <p className="leading-relaxed text-ink-2">Güncel belgeleri bu topluluk adına onayladın.</p>
          <Link href={next} className="min-h-11 underline underline-offset-4">Devam et</Link>
        </div>
      ) : (
        <PolicyConsentForm communityId={scope.community.id} documents={consent.documents} next={next} />
      )}
    </CommunityLayout>
  );
}
