import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getViewer } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/community-input";
import { isPolicyKind, policyTitle } from "@/lib/policies";
import { CommunityLayout } from "@/components/community-layout";

export const metadata = { title: "Taslak belge", robots: { index: false, follow: false } };

/** Taslak yalnız head admin'e gösterilir; herkese açık belge adresleri yalnız yayınlanmış/emekli sürümü verir. */
export default async function Page({ params }: PageProps<"/yonetim/belgeler/[id]">) {
  await connection();
  const viewer = await getViewer();
  if (!viewer?.isHeadAdmin) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const result = await createAdminClient().from("policy_documents").select("kind,version,content,content_sha256,status").eq("id", id).maybeSingle();
  if (result.error) throw new Error("Belge okunamadı. Tekrar dene.");
  const doc = result.data;
  if (!doc || !isPolicyKind(doc.kind)) notFound();
  return (
    <CommunityLayout viewer={viewer} title={`${policyTitle(doc.kind)} · taslak`} note={`Sürüm ${doc.version} · ${doc.status === "draft" ? "henüz yayınlanmadı" : "yayınlanmış"}`}>
      <article className="max-w-[70ch] whitespace-pre-wrap break-words text-[1.0625rem] leading-relaxed">{doc.content}</article>
      <p className="max-w-[70ch] break-all font-mono text-xs text-ink-3">SHA-256: {doc.content_sha256}</p>
    </CommunityLayout>
  );
}
