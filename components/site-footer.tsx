import Link from "next/link";
import { TAGLINE, Wordmark } from "@/components/brand";

const links = [
  { href: "/dogrula", label: "Mühür doğrula" },
  { href: "/sergiler", label: "Sergiler" },
  { href: "/belge", label: "Katılım belgesi" },
  { href: "/gizlilik", label: "Aydınlatma metni" },
];

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-[1240px] px-5 pb-10 sm:px-8">
      <div className="grid gap-x-8 gap-y-4 border-t border-rule pt-6 md:grid-cols-[1fr_auto]">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Wordmark className="text-[1.125rem]" />
          <span className="text-[0.9375rem] text-ink-2">{TAGLINE}</span>
        </p>
        <nav aria-label="Alt bağlantılar" className="flex flex-wrap gap-x-5 gap-y-2 text-[0.875rem]">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-ink-2 hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-[0.8125rem] text-ink-3 md:col-span-2">DEÜ CS&amp;AI · Düşün, Bağlan, Üret.</p>
      </div>
    </footer>
  );
}
