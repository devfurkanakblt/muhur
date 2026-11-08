import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { getEvent, getViewer } from "@/lib/data";
import { CertificateMaker } from "./certificate-maker";

export const metadata = {
  title: "Katılım belgesi",
  description: "Hackathon katılımcıları adını ve soyadını yazarak kendine özel katılım belgesini indirir.",
};

export default async function CertificatePage() {
  await connection();
  const [viewer, event] = await Promise.all([getViewer(), getEvent()]);
  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1240px] flex-1 px-5 pt-14 pb-28 sm:px-8 md:pt-20 print:max-w-none print:p-0">
        <div className="no-print max-w-[60ch]">
          <h1 className="text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]">Katılım belgesi.</h1>
          <p className="mt-4 text-[1.125rem] leading-relaxed text-ink-2">
            {event.title} katılımcısıysan adını ve soyadını yaz; belgen hemen hazırlanır. PNG olarak indirebilir ya da yazdırıp PDF olarak kaydedebilirsin.
          </p>
        </div>
        <CertificateMaker />
      </main>
    </>
  );
}
