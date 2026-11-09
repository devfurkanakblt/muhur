import Link from "next/link";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { SignInButton } from "@/components/buttons";
import { getViewer, requireEventBySlug } from "@/lib/data";
import { eventPath } from "@/lib/event-routes";
import { certificateAccess } from "@/lib/certificate-access";
import { CertificateMaker } from "./certificate-maker";
import { gorunenEtkinlik } from "@/components/suspension-notice";

export async function generateMetadata({ params }: PageProps<"/e/[slug]/belge">) {
  const { slug } = await params;
  const event = await requireEventBySlug(slug);
  return {
    title: { absolute: `${event.title} · mühür` },
    description: "Hackathon katılımcıları GitHub ile giriş yapıp adını ve soyadını yazarak kendine özel katılım belgesini indirir.",
  };
}

export default async function CertificatePage({ params }: PageProps<"/e/[slug]/belge">) {
  await connection();
  const { slug } = await params;
  const [viewer, loaded] = await Promise.all([getViewer(), requireEventBySlug(slug)]);
  // Bu sayfa askı gerekçesini göstermez; başlığa da taşınmaz.
  const event = gorunenEtkinlik(loaded, false);
  const access = await certificateAccess(viewer, event);
  return (
    <>
      <SiteHeader viewer={viewer} event={event} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1240px] flex-1 px-5 pt-14 pb-28 sm:px-8 md:pt-20 print:max-w-none print:p-0">
        <div className="no-print max-w-[60ch]">
          <h1 className="text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]">Katılım belgesi.</h1>
          {access === "izinli" && (
            <p className="mt-4 text-[1.125rem] leading-relaxed text-ink-2">
              Adını ve soyadını yaz; belgen hemen hazırlanır. PNG olarak indirebilir ya da yazdırıp PDF olarak kaydedebilirsin.
            </p>
          )}
          {access === "giris" && (
            <>
              <p className="mt-4 text-[1.125rem] leading-relaxed text-ink-2">
                Katılım belgesi yalnızca {event.title} katılımcılarına verilir. Ekibine katıldığın GitHub hesabınla giriş yap.
              </p>
              <div className="mt-8">
                <SignInButton next={eventPath(event.slug, "belge")} label="GitHub ile giriş yap" />
              </div>
            </>
          )}
          {access === "katilimci-degil" && (
            <p className="mt-4 text-[1.125rem] leading-relaxed text-ink-2">
              <span className="font-medium text-ink">@{viewer?.login}</span> hesabı {event.title} etkinliğinde bir ekibe kayıtlı görünmüyor. Katılım
              belgesi yalnızca ekip üyelerine verilir. Ekibine başka bir GitHub hesabıyla katıldıysan çıkış yapıp o hesapla gir; bir hata olduğunu
              düşünüyorsan organizasyon ekibine yaz. <Link href={eventPath(event.slug, "panel")} className="underline">Projem</Link>
            </p>
          )}
        </div>
        {access === "izinli" && <CertificateMaker slug={event.slug} />}
      </main>
    </>
  );
}
