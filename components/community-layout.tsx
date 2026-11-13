import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import type { Viewer } from "@/lib/data";
export function CommunityLayout({ viewer, title, note, children }: { viewer: Viewer | null; title: string; note?: string; children: React.ReactNode }) {
  return <><SiteHeader viewer={viewer} /><main id="main-content" tabIndex={-1} className="mx-auto grid w-full max-w-[1240px] flex-1 content-start gap-12 px-5 pt-10 pb-28 sm:px-8 md:pt-16">
    <div className="max-w-[70ch]"><Link href="/" className="mb-6 inline-flex min-h-11 items-center text-sm text-ink-3 underline underline-offset-4">Mühür ana sayfası</Link><h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em] text-balance">{title}</h1>{note && <p className="mt-4 max-w-[60ch] text-[1.0625rem] leading-relaxed text-ink-2">{note}</p>}</div>{children}
  </main></>;
}
export function CommunitySection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="grid min-w-0 gap-6 border-t border-rule pt-7"><h2 className="text-xl font-semibold">{title}</h2>{children}</section>; }
