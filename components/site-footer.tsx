import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { getCurrentPlatformPolicy } from "@/lib/policy-data";
import { policyPath } from "@/lib/policies";

const links = [
  { href: "/dogrula", label: "Mühür doğrula" },
  { href: "/sergiler", label: "Sergiler" },
  { href: "/belge", label: "Katılım belgesi" },
];

/**
 * Platform imzası her sayfada aynıdır ve etkinlik renginden etkilenmez:
 * "mühür · DEÜ CS&AI topluluğu tarafından geliştirildi · Kullanım Sözleşmesi · Gizlilik".
 * Sözleşme bağlantısı Plan 4'te yayınlanmış güncel sürüme gider; yayın yoksa gösterilmez.
 */
export async function SiteFooter() {
  const platform = await getCurrentPlatformPolicy();
  return (
    <footer className="mx-auto w-full max-w-[1240px] px-5 pb-10 sm:px-8">
      <div className="grid gap-x-8 gap-y-4 border-t border-rule pt-6 md:grid-cols-[1fr_auto]">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.875rem] text-ink-2">
          <Wordmark className="text-[1.125rem] text-ink" />
          <span aria-hidden>·</span>
          <span>DEÜ CS&amp;AI topluluğu tarafından geliştirildi</span>
          {platform && <><span aria-hidden>·</span><Link href={policyPath("platform", platform.version)} className="hover:text-ink">Kullanım Sözleşmesi</Link></>}
          <span aria-hidden>·</span>
          <Link href="/gizlilik" className="hover:text-ink">Gizlilik</Link>
        </p>
        <nav aria-label="Alt bağlantılar" className="flex flex-wrap gap-x-5 gap-y-2 text-[0.875rem]">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center text-ink-2 hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
