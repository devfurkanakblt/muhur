import "server-only";
import { getEvent, getExhibits } from "@/lib/data";
import { env } from "@/lib/env";
import type { Winner } from "@/lib/winner-model";
import { getWinners } from "@/lib/winners";

export type StageData = {
  title: string;
  startsAt: string;
  deadline: string;
  locked: boolean;
  sealTime: string;
  count: number;
  sealed: number;
  now: number;
  announcement: string | null;
  recent: { no: number; name: string; team: string; pushedAt: string }[];
  /** Jüri ödülleri açıklanma sırasıyla, ardından halkın seçimi. */
  winners: Winner[];
  voting: string;
  siteUrl: string;
};

/** Sahne modunun ihtiyaç duyduğu her şey; yalnızca herkese açık bilgiler. */
export async function getStageData(): Promise<StageData> {
  const event = await getEvent();
  const [exhibits, winners] = await Promise.all([getExhibits(event.id), getWinners(event)]);
  const recent = exhibits
    .filter((e) => {
      if (!e.last_pushed_at) return false;
      const t = new Date(e.last_pushed_at).getTime();
      return t >= new Date(event.startsAt).getTime() && (!event.locked || t <= new Date(event.sealTime).getTime());
    })
    .sort((a, b) => +new Date(b.last_pushed_at!) - +new Date(a.last_pushed_at!))
    .slice(0, 5)
    .map((e) => ({ no: e.exhibit_no, name: e.name, team: e.team_name, pushedAt: e.last_pushed_at! }));
  return {
    title: event.title,
    startsAt: event.startsAt,
    deadline: event.deadline,
    locked: event.locked,
    sealTime: event.sealTime,
    count: exhibits.length,
    sealed: exhibits.filter((e) => e.archive_sha256).length,
    now: event.now,
    announcement: event.announcement,
    recent,
    winners,
    voting: event.voting,
    siteUrl: env.siteUrl,
  };
}
