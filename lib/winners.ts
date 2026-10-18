import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { exhibitPath, getAwards, getExhibits, getVotes, logoUrl, type EventState, type Exhibit } from "@/lib/data";
import { env } from "@/lib/env";
import { notify, tg } from "@/lib/notify";
import { PEOPLES_CHOICE, peoplesChoiceId, winnerAnnouncement, type Winner } from "@/lib/winner-model";

async function getMembersOf(projectIds: string[]) {
  const members = new Map<string, Winner["members"]>();
  if (!projectIds.length) return members;
  const { data, error } = await createAdminClient().from("project_members")
    .select("project_id, github_login, avatar_url").in("project_id", projectIds).order("joined_at");
  if (error) {
    console.error("[veri] Kazanan ekipleri:", error.message);
    throw new Error("Kazanan ekipleri okunamadı. Lütfen biraz sonra tekrar dene.");
  }
  for (const m of data ?? []) {
    members.set(m.project_id, [...(members.get(m.project_id) ?? []), { login: m.github_login, avatar: m.avatar_url }]);
  }
  return members;
}

/**
 * Etkinliğin kazananları: önce jüri ödülleri açıklanma sırasıyla, ardından halkın seçimi (berabere kalan
 * eserlerin hepsi). Yalnızca herkese açık bilgiler; sahne API'si de bunu döndürür.
 */
export async function getWinners(event: EventState): Promise<Winner[]> {
  const [exhibits, awards, votes] = await Promise.all([getExhibits(event.id), getAwards(event.id), getVotes(event, null)]);
  const byId = new Map(exhibits.map((e) => [e.id, e]));
  const tallies = votes.tallies ?? {};
  const best = Math.max(0, ...Object.values(tallies));
  const people = best > 0 ? exhibits.filter((e) => (tallies[e.id] ?? 0) === best) : [];
  const members = await getMembersOf([...new Set([...awards.map((a) => a.project_id), ...people.map((e) => e.id)])]);
  const project = (e: Exhibit) => ({
    projectId: e.id, no: e.exhibit_no, name: e.name, team: e.team_name, logo: logoUrl(e.logo_path),
    href: exhibitPath(event.slug, e.exhibit_no), members: members.get(e.id) ?? [],
  });
  return [
    ...awards.flatMap((a): Winner[] => {
      const e = byId.get(a.project_id);
      return e ? [{ id: a.id, kind: "juri", title: a.title, reason: a.reason, votes: null, ...project(e) }] : [];
    }),
    ...people.map((e): Winner => ({ id: peoplesChoiceId(e.id), kind: "halk", title: PEOPLES_CHOICE, reason: null, votes: best, ...project(e) })),
  ];
}

/** Telegram'ın indirdiği kazanan kartı (1200×630 PNG). */
export function winnerCardUrl(id: string) {
  return `${env.siteUrl.replace(/\/$/, "")}/api/kazanan/${encodeURIComponent(id)}`;
}

/** Yeni jüri ödülünü kanala duyurur: kupa stikırı, kazanan kartı ve altında eser, ekip, gerekçe. */
export async function announceAward(event: EventState, awardId: string) {
  let winner: Winner | undefined;
  try {
    winner = (await getWinners(event)).find((w) => w.id === awardId);
  } catch (e) {
    console.error("[kazanan] ödül duyurusu hazırlanamadı:", e instanceof Error ? e.message : e);
    return false;
  }
  if (!winner) return false;
  return notify(winnerAnnouncement([winner], env.siteUrl), "kazanan", { photo: winnerCardUrl(winner.id) });
}

/** Oylama sonuçlanınca halkın seçimini adıyla duyurur; oy yoksa ya da okunamazsa yalnızca sonucun açıklandığı söylenir. */
export async function announcePeoplesChoice(event: EventState) {
  let winners: Winner[] = [];
  try {
    // Çağıran, güncellemeden önce okunmuş etkinliği verir; sonuçlar yalnızca 'sonuclandi' durumunda sayılır.
    winners = (await getWinners({ ...event, voting: "sonuclandi" })).filter((w) => w.kind === "halk");
  } catch (e) {
    console.error("[kazanan] halkın seçimi okunamadı:", e instanceof Error ? e.message : e);
  }
  if (!winners.length) return notify([`🏆 ${tg.b("Halkın seçimi sonuçlandı.")}`, tg.link(env.siteUrl, "Sonuçlara bak")], "kazanan");
  return notify(winnerAnnouncement(winners, env.siteUrl), "kazanan", winners.length === 1 ? { photo: winnerCardUrl(winners[0].id) } : {});
}
