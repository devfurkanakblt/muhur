import { legacyRedirect } from "@/lib/legacy-redirect";

/** Eski adres: girişliyse ekibinin etkinliğinin paneline, değilse en uygun listelenen etkinliğin paneline (307). */
export default async function LegacyPanel({ searchParams }: PageProps<"/panel">) {
  return legacyRedirect("panel", searchParams, { viewerFirst: true });
}
