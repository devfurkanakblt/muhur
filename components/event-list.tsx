import Link from "next/link";
import { EventCountdown } from "@/components/event-countdown";
import { formatDateTime, formatDay } from "@/lib/format";

/** Liste satırı için gereken alanlar; askı gerekçesi gibi iç bilgiler bu bileşene hiç girmez. */
export type EventListItem = {
  id: string;
  href: string;
  title: string;
  communityName: string | null;
  communityCity: string | null;
  startsAt: string;
  deadline: string;
  sealTime: string;
};

/** Topluluk logosu gelene kadar yer tutucu: adın ilk iki kelimesinin baş harfleri. */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join("")
    .toLocaleUpperCase("tr");
}

/**
 * Ana sayfanın etkinlik listesi. `active` satırlarında sağda geri sayım (başlamadıysa "Yakında"),
 * geçmiş satırlarda mühür günü görünür. Kart yok: satırlar kıl çizgiyle ayrılır.
 */
export function EventList({ events, kind, now }: { events: EventListItem[]; kind: "active" | "past"; now: number }) {
  return (
    <ul className="divide-y divide-rule border-b border-rule">
      {events.map((e) => {
        const org = e.communityName ?? "mühür";
        const started = now >= new Date(e.startsAt).getTime();
        return (
          <li key={e.id}>
            <Link href={e.href} className="group grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-x-4 py-5">
              <span aria-hidden className="grid size-[42px] place-items-center rounded-[2px] border border-rule-strong bg-plinth text-[0.875rem] font-semibold tracking-[0.02em]">
                {initials(org)}
              </span>
              <span className="min-w-0">
                <span className="line-clamp-2 block text-[1.125rem] leading-snug font-semibold tracking-[-0.01em] group-hover:underline sm:truncate">{e.title}</span>
                <span className="block truncate text-[0.875rem] text-ink-2">
                  {[e.communityName, e.communityCity].filter(Boolean).join(" · ") || "mühür"}
                </span>
              </span>
              <span className="text-right text-[0.9375rem]">
                {kind === "past" ? (
                  <span className="whitespace-nowrap text-ink-2">{formatDay(e.sealTime)}</span>
                ) : started ? (
                  <>
                    <span className="sr-only">Son teslim {formatDateTime(e.deadline)}</span>
                    <EventCountdown deadline={e.deadline} serverNow={now} />
                  </>
                ) : (
                  <span className="whitespace-nowrap text-ink-2" title={`Başlangıç ${formatDateTime(e.startsAt)}`}>Yakında</span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
