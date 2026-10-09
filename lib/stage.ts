import "server-only";
import { getEvent, getExhibits, getVotes } from "@/lib/data";
import { env } from "@/lib/env";

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
  winner: { name: string; team: string; votes: number } | null;
  winners: { name: string; team: string; votes: number }[];
  voting: string;
  siteUrl: string;
};

/** Sahne modunun ihtiyaç duyduğu her şey; yalnızca herkese açık bilgiler. */
export async function getStageData(): Promise<StageData> {
  const event = await getEvent();
  const [exhibits, votes] = await Promise.all([getExhibits(event.id), getVotes(event, null)]);
  const recent = exhibits
    .filter((e) => {
      if (!e.last_pushed_at) return false;
      const t = new Date(e.last_pushed_at).getTime();
      return t >= new Date(event.startsAt).getTime() && (!event.locked || t <= new Date(event.sealTime).getTime());
    })
    .sort((a, b) => +new Date(b.last_pushed_at!) - +new Date(a.last_pushed_at!))
    .slice(0, 5)
    .map((e) => ({ no: e.exhibit_no, name: e.name, team: e.team_name, pushedAt: e.last_pushed_at! }));
  let winner: StageData["winner"] = null;
  let winners: StageData["winners"] = [];
  if (votes.tallies) {
    const top = exhibits
      .map((e) => ({ e, v: votes.tallies![e.id] ?? 0 }))
      .sort((a, b) => b.v - a.v)[0];
    if (top && top.v > 0) {
      winners = exhibits.filter(e => (votes.tallies![e.id] ?? 0) === top.v).map(e => ({ name: e.name, team: e.team_name, votes: top.v }));
      winner = winners[0];
    }
  }
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
    winner,
    winners,
    voting: event.voting,
    siteUrl: env.siteUrl,
  };
}
