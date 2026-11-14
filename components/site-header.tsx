import Link from "next/link";
import { Mascot } from "@/components/mascot/mascot";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Announcement } from "@/components/announcement";
import { getManagementScope, type EventState, type Viewer } from "@/lib/data";
import { eventPath } from "@/lib/event-routes";
import { getEventAccess } from "@/lib/access";
import { can } from "@/lib/authz";
import { hasMascotNaming } from "@/lib/mascot-naming";
import { env } from "@/lib/env";
import { signOut } from "@/app/actions";
import { ActionForm, ActionButton } from "@/components/action-form";

const navLink = "inline-flex min-h-11 items-center text-ink-2 hover:text-ink";

/**
 * Etkinlik sayfalarında (`event` verilince) gezinme o etkinliğin yüzeylerine gider ve duyuru şeridi o etkinliğindir.
 * Platform sayfalarında yalnızca wordmark, sergiler, (yetkisi olana) yönetim merkezi ve tema düğmesi görünür.
 */
export async function SiteHeader({ viewer, event }: { viewer: Viewer | null; event?: EventState }) {
  // "Yönetim" bağlantısı etkinliği inceleyebilenlere (topluluk rolü, head admin) görünür.
  const access = event ? await getEventAccess(viewer, event) : null;
  const canInspect = can(access, "incele");
  // Platform başlığında "Yönetim" yalnızca merkezde gösterecek bir şeyi olana görünür (diğerleri için merkez 404).
  const hub = !event && viewer ? (await getManagementScope(viewer)).open : false;
  return (
    <>
      {event?.announcement && event.announcementAt && <Announcement text={event.announcement} stamp={event.announcementAt} />}
      <header className="mx-auto flex min-h-16 w-full max-w-[1240px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2 sm:px-8">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5 rounded-[2px]" aria-label="mühür, ana sayfa">
            <Mascot mood="normal" title="" className="mascot-sm h-7 w-auto" />
            <Wordmark className="text-[1.375rem] leading-none" />
          </Link>
          {event?.communityName && (
            <Link href={eventPath(event.slug)} className="hidden border-l border-rule-strong pl-2.5 text-[0.8125rem] leading-none text-ink-3 hover:text-ink sm:inline">
              {event.communityName}
            </Link>
          )}
        </div>
        {event ? (
          <nav aria-label="Ana gezinme" className="flex flex-wrap items-center gap-3 text-[0.9375rem] sm:gap-5">
            <Link href={`${eventPath(event.slug)}#vitrin`} className={navLink}>
              Vitrin
            </Link>
            {hasMascotNaming(event) && (
              <Link href={eventPath(event.slug, "maskot")} className={navLink}>
                Maskota isim ver
              </Link>
            )}
            <Link href={eventPath(event.slug, "belge")} className={navLink}>
              Katılım belgesi
            </Link>
            {(access?.juror || canInspect) && <Link href={eventPath(event.slug) + "/juri"} className={navLink}>Jüri alanı</Link>}
            {canInspect && (
              <Link href={eventPath(event.slug, "yonetim")} className="text-ink-2 hover:text-ink">
                Yönetim
              </Link>
            )}
            {viewer && (
              <>
                <Link href={eventPath(event.slug, "panel")} aria-label="Projem" className="flex items-center gap-2 text-ink hover:text-ink-2">
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
        ) : (
          <nav aria-label="Ana gezinme" className="flex flex-wrap items-center gap-3 text-[0.9375rem] sm:gap-5">
            {env.communityApplicationsEnabled && <Link href="/topluluk/basvur" className={navLink}>Topluluğunu kaydet</Link>}
            <Link href="/sergiler" className={navLink}>
              Sergiler
            </Link>
            {hub && (
              <Link href="/yonetim" className={navLink}>
                Yönetim
              </Link>
            )}
            <ThemeToggle />
          </nav>
        )}
      </header>
    </>
  );
}
