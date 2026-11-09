import { legacyRedirect } from "@/lib/legacy-redirect";
import { hasMascotNaming } from "@/lib/mascot-naming";

/** Eski adres: maskota isim verme yalnızca maskotun topluluğunun (DEÜ CS&AI) etkinliklerindedir; onların en uygununa (307). */
export default async function LegacyMascot({ searchParams }: PageProps<"/maskot">) {
  return legacyRedirect("maskot", searchParams, { filter: hasMascotNaming });
}
