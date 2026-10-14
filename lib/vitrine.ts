import "server-only";
import { exhibitPath, getExhibits, getOwnProject, getVotes, logoUrl, type EventState, type Viewer } from "@/lib/data";
import { relativeTR } from "@/lib/format";
import type { VitrineItem, VitrineVoting } from "@/components/vitrine";
import { getWinners } from "@/lib/winners";

/** Bir etkinliğin vitrinini sunucuda hazırlar: eser bağlantıları, nabız, oy durumu ve kazananlar. */
export async function buildVitrine(event: EventState, viewer: Viewer | null) {
  const [exhibits, own, votes, winners] = await Promise.all([
    getExhibits(event.id),
    viewer ? getOwnProject(viewer.id, event.id) : null,
    getVotes(event, viewer?.id ?? null),
    getWinners(event),
  ]);
  const items: VitrineItem[] = exhibits.map((e) => ({
    ...e,
    logo: logoUrl(e.logo_path),
    href: exhibitPath(event.slug, e.exhibit_no),
    // Nabız yalnızca etkinlik başladıktan sonraki push'ları gösterir.
    pulse: e.last_pushed_at && new Date(e.last_pushed_at) >= new Date(event.startsAt) ? `son push ${relativeTR(e.last_pushed_at)}` : null,
    own: own?.id === e.id,
    awards: winners.filter((w) => w.projectId === e.id).map((w) => ({ kind: w.kind, title: w.title })),
  }));
  const voting: VitrineVoting = { state: event.voting, myVote: votes.myVote, tallies: votes.tallies, signedIn: !!viewer };
  return { items, voting, own, winners };
}
