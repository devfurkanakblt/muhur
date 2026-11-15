import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/data";
import { policyKindFromSlug, policyTitle } from "@/lib/policies";
import { formatDateTime } from "@/lib/format";
import { CommunityLayout } from "@/components/community-layout";

export const metadata = { title: "Kullanım belgeleri" };

/**
 * Yayınlanmış ya da emekli sürümün değişmez metni. Taslak herkese gösterilmez. Sürüm ve SHA-256 görünür;
 * hash, sayfada gösterilen bu metnin (NFC, LF) UTF-8 baytlarından hesaplanmıştır. Eski sürüm adresi ve kabulü kalır.
 */
export default async function Page({ params }: PageProps<"/kosullar/[kind]/[version]">) {
  const { kind: slug, version: raw } = await params;
  const kind = policyKindFromSlug(slug);
  if (!kind) notFound();
  let version: string;
  try { version = decodeURIComponent(raw); } catch { notFound(); }
  const result = await createAdminClient().from("policy_documents").select("id,kind,version,content,content_sha256,status,published_at").eq("kind", kind).eq("version", version).in("status", ["published", "retired"]).maybeSingle();
  if (result.error) throw new Error("Belge okunamadı. Tekrar dene.");
  if (!result.data) notFound();
  const doc = result.data;
  return (
    <CommunityLayout viewer={await getViewer()} title={policyTitle(kind)} note={`Sürüm ${doc.version}${doc.published_at ? ` · yayın ${formatDateTime(doc.published_at)}` : ""}`}>
      {doc.status === "retired" && <p role="status" className="max-w-[70ch] border-l-2 border-ink pl-4 leading-relaxed">Bu sürüm artık geçerli değil. Bu sürümü kabul etmiş kişilerin kanıtı için metin olduğu gibi saklanır.</p>}
      <article className="max-w-[70ch] whitespace-pre-wrap break-words text-[1.0625rem] leading-relaxed">{doc.content}</article>
      <p className="max-w-[70ch] break-all font-mono text-xs text-ink-3">SHA-256: {doc.content_sha256}</p>
    </CommunityLayout>
  );
}
