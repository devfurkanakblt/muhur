import "server-only";
import { exhibitPath, getExhibits, getOwnProject, getVotes, getAwards, logoUrl, type EventState, type Viewer } from "@/lib/data";
import { relativeTR } from "@/lib/format";
import type { VitrineItem, VitrineVoting } from "@/components/vitrine";

/** Bir etkinliğin vitrinini sunucuda hazırlar: eser bağlantıları, nabız, oy durumu. */
export async function buildVitrine(event: EventState, viewer: Viewer | null) {
  const [exhibits, own, votes, awards] = await Promise.all([
    getExhibits(event.id),
    viewer ? getOwnProject(viewer.id, event.id) : null,
    getVotes(event, viewer?.id ?? null),
    getAwards(event.id),
  ]);
  const items: VitrineItem[] = exhibits.map((e) => ({
    ...e,
    logo: logoUrl(e.logo_path),
    href: exhibitPath(event.slug, e.exhibit_no),
    // Nabız yalnızca etkinlik başladıktan sonraki push'ları gösterir.
    pulse: e.last_pushed_at && new Date(e.last_pushed_at) >= new Date(event.startsAt) ? `son push ${relativeTR(e.last_pushed_at)}` : null,
    own: own?.id === e.id,
    awards: awards.filter(a => a.project_id === e.id).map(a => ({ title: a.title, reason: a.reason })),
  }));
  const voting: VitrineVoting = { state: event.voting, myVote: votes.myVote, tallies: votes.tallies, signedIn: !!viewer };
  return { items, voting, own };
}
