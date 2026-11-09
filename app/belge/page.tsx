import { legacyRedirect } from "@/lib/legacy-redirect";

/** Eski adres: en uygun listelenen etkinliğin katılım belgesine (307). */
export default async function LegacyCertificate({ searchParams }: PageProps<"/belge">) {
  return legacyRedirect("belge", searchParams);
}
