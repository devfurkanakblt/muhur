import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getAdminSession, getViewer } from "@/lib/data";
import { getPolicyAdminDocuments } from "@/lib/policy-data";
import { POLICY_KINDS, policyPath, policyTitle } from "@/lib/policies";
import { formatDateTime } from "@/lib/format";
import { CommunityLayout, CommunitySection } from "@/components/community-layout";
import { PublishPolicyForm } from "@/components/policy-admin-forms";

export const metadata = { title: "Platform belgeleri", robots: { index: false, follow: false } };
const STATUS = { draft: "Taslak", published: "Yayında", retired: "Emekli" } as const;

/**
 * Head admin: taslaklar `npm run policy -- draft …` ile hazırlanır, burada taze oturumla yayınlanır.
 * Yayınlanan metin değişmez; yeni metin yeni sürümdür ve eski adres/kabuller kalır.
 */
export default async function Page() {
  await connection();
  const viewer = await getViewer();
  if (!viewer?.isHeadAdmin) notFound();
  const [docs, session] = await Promise.all([getPolicyAdminDocuments(), getAdminSession()]);
  return (
    <CommunityLayout viewer={viewer} title="Platform belgeleri" note="Sözleşme metinleri hukuki inceleme sonrası taslak olarak yüklenir. Yayın, türün geçerli sürümünü değiştirir; yöneticiler bir sonraki yönetim işleminden önce yeniden onaylar, katılımcılar bir sonraki etkinlik kaydında onaylar.">
      {!session?.fresh && <p className="text-danger">Yayından önce GitHub ile yeniden giriş yapmalısın. Yönetim merkezindeki oturum düğmesini kullan.</p>}
      {POLICY_KINDS.map(kind => {
        const list = docs.filter(d => d.kind === kind);
        const current = list.find(d => d.current) ?? null;
        return (
          <CommunitySection key={kind} title={policyTitle(kind)}>
            <p className="text-sm text-ink-2">{current ? <>Geçerli sürüm: <Link className="underline underline-offset-4" href={policyPath(kind, current.version)}>{current.version}</Link></> : "Henüz yayınlanmış sürüm yok."}</p>
            {list.length ? <ul className="divide-y divide-rule">{list.map(d => (
              <li key={d.id} className="grid gap-3 py-4">
                <p>Sürüm {d.version} <span className="text-sm text-ink-3">· {STATUS[d.status]}{d.published_at ? ` · ${formatDateTime(d.published_at)}` : ` · ${formatDateTime(d.created_at)}`}</span></p>
                <p className="break-all font-mono text-xs text-ink-3">SHA-256: {d.content_sha256}</p>
                {d.status === "draft"
                  ? <><Link className="justify-self-start underline underline-offset-4" href={`/yonetim/belgeler/${d.id}`}>Taslağı oku</Link><PublishPolicyForm documentId={d.id} expected={current?.id ?? null} version={d.version} /></>
                  : <Link className="justify-self-start underline underline-offset-4" href={policyPath(d.kind, d.version)}>Yayınlanmış metni aç</Link>}
              </li>
            ))}</ul> : <p className="text-sm text-ink-3">Taslak yok.</p>}
          </CommunitySection>
        );
      })}
    </CommunityLayout>
  );
}
