import Link from "next/link";
import { Mascot } from "@/components/mascot/mascot";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Announcement } from "@/components/announcement";
import { getEvent, type Viewer } from "@/lib/data";
import { getEventAccess } from "@/lib/access";
import { can } from "@/lib/authz";
import { signOut } from "@/app/actions";
import { ActionForm, ActionButton } from "@/components/action-form";

export async function SiteHeader({ viewer }: { viewer: Viewer | null }) {
  const event = await getEvent();
  // "Yönetim" bağlantısı etkinliği inceleyebilenlere (topluluk rolü, head admin) görünür.
  const canInspect = can(await getEventAccess(viewer, event), "incele");
  return (
    <>
      {event.announcement && event.announcementAt && <Announcement text={event.announcement} stamp={event.announcementAt} />}
      <header className="mx-auto flex min-h-16 w-full max-w-[1240px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 rounded-[2px]" aria-label="mühür, ana sayfa">
          <Mascot mood="normal" title="" className="mascot-sm h-7 w-auto" />
          <Wordmark className="text-[1.375rem] leading-none" />
          <span className="hidden border-l border-rule-strong pl-2.5 text-[0.8125rem] leading-none text-ink-3 sm:inline">
            DEÜ CS&amp;AI
          </span>
        </Link>
        <nav aria-label="Ana gezinme" className="flex flex-wrap items-center gap-3 text-[0.9375rem] sm:gap-5">
          <Link href="/#vitrin" className="inline-flex min-h-11 items-center text-ink-2 hover:text-ink">
            Vitrin
          </Link>
          <Link href="/maskot" className="inline-flex min-h-11 items-center text-ink-2 hover:text-ink">
            Maskota isim ver
          </Link>
          <Link href="/belge" className="inline-flex min-h-11 items-center text-ink-2 hover:text-ink">
            Katılım belgesi
          </Link>
          {canInspect && (
            <Link href="/yonetim" className="text-ink-2 hover:text-ink">
              Yönetim
            </Link>
          )}
          {viewer && (
            <>
              <Link href="/panel" aria-label="Projem" className="flex items-center gap-2 text-ink hover:text-ink-2">
                {viewer.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={viewer.avatarUrl} alt="" className="h-6 w-6 rounded-full border border-rule" />
                )}
                <span>Projem</span>
              </Link>
              <ActionForm action={signOut} className="hidden sm:block">
                <ActionButton pending="Çıkılıyor…" className="press text-ink-3 hover:text-ink">Çıkış</ActionButton>
              </ActionForm>
            </>
          )}
          <ThemeToggle />
        </nav>
      </header>
    </>
  );
}
