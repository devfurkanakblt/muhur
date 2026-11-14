import { connection } from "next/server";
import { requireEventBySlug } from "@/lib/data";
import { getStageData } from "@/lib/stage";
import { qrMatrix } from "@/lib/qr";
import { Stage } from "./stage";

export async function generateMetadata({ params }: PageProps<"/e/[slug]/sahne">) {
  const { slug } = await params;
  const event = await requireEventBySlug(slug);
  return { title: { absolute: `${event.title} · mühür` } };
}

export default async function StagePage({ params }: PageProps<"/e/[slug]/sahne">) {
  await connection();
  const { slug } = await params;
  const event = await requireEventBySlug(slug);
  const initial = await getStageData(event);
  const qrRows = qrMatrix(initial.vitrinUrl).map((row) => row.map((dark) => (dark ? "1" : "0")).join(""));
  return <Stage slug={event.slug} initial={initial} qrRows={qrRows} />;
}
