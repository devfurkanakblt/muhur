import Link from "next/link";
import { connection } from "next/server";
import { getViewer } from "@/lib/data";
import { getOwnPolicyHistory } from "@/lib/policy-data";
import { policyPath, policyTitle } from "@/lib/policies";
import { formatDateTime } from "@/lib/format";
import { CommunityLayout, CommunitySection } from "@/components/community-layout";
import { SignInButton } from "@/components/buttons";

export const metadata = { title: "Onay geçmişim", robots: { index: false, follow: false } };

/**
 * Kişinin kendi kabul geçmişi: belge, sürüm, kapsam ve tarih. Yalnız oturum sahibine okunur; IP, cihaz
 * veya oturum bilgisi tutulmaz. Kayıtlar değiştirilemez; eski sürümlerin metni kendi adresinde kalır.
 */
export default async function Page() {
  await connection();
  const viewer = await getViewer();
  if (!viewer) {
    return <CommunityLayout viewer={null} title="Onay geçmişim" note="Kabul ettiğin belgeleri görmek için giriş yap."><SignInButton next="/hesabim/onaylar" label="GitHub ile giriş yap" /></CommunityLayout>;
  }
  const history = await getOwnPolicyHistory(viewer.id);
  const empty = !history.acceptances.length && !history.terms.length && !history.enrollments.length;
  return (
    <CommunityLayout viewer={viewer} title="Onay geçmişim" note="Hangi belgeyi, hangi sürümde, hangi topluluk ya da etkinlik için ne zaman kabul ettiğin. Bu kayıtlar sonradan değiştirilemez.">
      {empty && <p className="text-ink-2">Henüz kayıtlı bir onayın yok.</p>}
      {history.acceptances.length > 0 && (
        <CommunitySection title="Platform belgeleri">
          <ul className="divide-y divide-rule">
            {history.acceptances.map(a => (
              <li key={a.id} className="grid gap-1 py-4">
                <Link href={policyPath(a.kind, a.version)} className="underline underline-offset-4">{policyTitle(a.kind)} · sürüm {a.version}</Link>
                <p className="text-sm text-ink-2">{a.scope === "community" ? "Topluluk adına" : "Etkinlik kaydı"}: {a.scopeName} · {formatDateTime(a.acceptedAt)}</p>
              </li>
            ))}
          </ul>
        </CommunitySection>
      )}
      {history.terms.length > 0 && (
        <CommunitySection title="Etkinlik kuralları">
          <ul className="divide-y divide-rule">
            {history.terms.map(t => (
              <li key={t.id} className="grid gap-1 py-4">
                <p>{t.eventTitle} · kural sürümü {t.version}</p>
                <p className="flex flex-wrap gap-x-4 text-sm"><a href={t.rulesUrl} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4">Kurallar ↗</a><a href={t.privacyUrl} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4">Aydınlatma metni ↗</a></p>
                <p className="text-sm text-ink-2">{formatDateTime(t.acceptedAt)}{t.contentSha256 ? "" : " · bağlantının o anki içeriği mühür tarafından saklanmaz"}</p>
                {t.contentSha256 && <p className="break-all font-mono text-xs text-ink-3">Topluluğun bildirdiği içerik özeti: {t.contentSha256}</p>}
              </li>
            ))}
          </ul>
        </CommunitySection>
      )}
      {history.enrollments.some(e => e.source === "legacy") && (
        <CommunitySection title="Önceki katılımlar">
          <p className="max-w-[60ch] text-sm leading-relaxed text-ink-2">Bu etkinliklere koşul onayı sistemi kurulmadan önce katıldın. Bu kayıt bir sözleşme onayı değildir; yalnız katılımının sürdüğünü gösterir.</p>
          <ul className="divide-y divide-rule">{history.enrollments.filter(e => e.source === "legacy").map(e => <li key={`${e.eventTitle}-${e.createdAt}`} className="py-3">{e.eventTitle}</li>)}</ul>
        </CommunitySection>
      )}
    </CommunityLayout>
  );
}
