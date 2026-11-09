import { legacyRedirect } from "@/lib/legacy-redirect";

/** Eski adres: en uygun listelenen etkinliğin sahnesine (307). */
export default async function LegacyStage({ searchParams }: PageProps<"/sahne">) {
  return legacyRedirect("sahne", searchParams);
}
