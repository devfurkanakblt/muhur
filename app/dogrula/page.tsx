import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { getViewer } from "@/lib/data";
import { Verifier } from "./verifier";

export const metadata = { title: "Mühür doğrula" };

export default async function VerifyPage() {
  await connection();
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1240px] flex-1 px-5 pt-14 pb-28 sm:px-8 md:pt-20">
        <div className="max-w-[60ch]">
          <h1 className="text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]">Mühür doğrula.</h1>
          <p className="mt-4 text-[1.125rem] leading-relaxed text-ink-2">
            Mühürlü bir arşivi buraya bırak ya da bir commit kodu yaz. Dosyanın parmak izi tarayıcında hesaplanır; dosya hiçbir yere yüklenmez.
          </p>
        </div>
        <Verifier />
      </main>
    </>
  );
}
