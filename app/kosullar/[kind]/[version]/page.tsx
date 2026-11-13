import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/data";
import { CommunityLayout } from "@/components/community-layout";
export const metadata = { title: "Kullanım belgeleri" };
const kinds: Record<string,string> = { platform: "platform", "veri-isleme": "data_processing", katilimci: "participant" };
export default async function Page({ params }: PageProps<"/kosullar/[kind]/[version]">) {
 const { kind, version } = await params; if (!kinds[kind]) notFound();
 const result = await createAdminClient().from("policy_documents").select("kind,version,content,content_sha256,status").eq("kind",kinds[kind]).eq("version",version).in("status",["published","retired"]).maybeSingle();
 if (result.error) throw new Error("Belge okunamadı. Tekrar dene."); if (!result.data) notFound(); const doc = result.data;
 return <CommunityLayout viewer={await getViewer()} title={doc.kind === "platform" ? "Platform Kullanım Sözleşmesi" : doc.kind === "data_processing" ? "Veri işleme eki" : "Katılımcı koşulları"} note={`Sürüm ${doc.version}`}><article className="max-w-[70ch] whitespace-pre-wrap text-[1.0625rem] leading-relaxed">{doc.content}</article><p className="max-w-[70ch] break-all font-mono text-xs text-ink-3">SHA-256: {doc.content_sha256}</p></CommunityLayout>;
}
