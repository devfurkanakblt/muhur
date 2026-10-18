import "server-only";
import { getEvent, getViewer } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/server";
import { selectAll } from "@/lib/paginate";

export type NamingPhase = "oneriler" | "oylama" | "sonuc";
export type NamingProposal = {
  id: string;
  name: string;
  createdAt: string;
  visible: boolean;
  votes: number;
  own: boolean;
};
export type NamingSnapshot = {
  phase: NamingPhase;
  proposals: NamingProposal[];
  canSuggest: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
  ownProposalId: string | null;
  votedProposalId: string | null;
};

type ProposalRow = {
  id: string;
  name: string;
  author_id: string;
  created_at: string;
  visible: boolean;
};

export async function getMascotNamingSnapshot(): Promise<NamingSnapshot> {
  const [event, viewer] = await Promise.all([getEvent(), getViewer()]);
  const db = createAdminClient();
  const [{ data: round, error: roundError }, rows, { data: tally, error: tallyError }, membership, vote] = await Promise.all([
    db.from("mascot_naming_rounds").select("phase").eq("event_id", event.id).single(),
    selectAll<ProposalRow>((from, to) => db.from("mascot_name_proposals")
      .select("id, name, author_id, created_at, visible", { count: "exact" })
      .eq("event_id", event.id).order("created_at", { ascending: true }).range(from, to)
      .overrideTypes<ProposalRow[], { merge: false }>()),
    db.rpc("mascot_name_tallies", { ev: event.id }),
    viewer ? db.from("project_members").select("user_id").eq("event_id", event.id).eq("user_id", viewer.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    viewer ? db.from("mascot_name_votes").select("proposal_id").eq("event_id", event.id).eq("voter_id", viewer.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (roundError || !round || tallyError || membership.error || vote.error) {
    throw new Error("Maskot isim etkinliği okunamadı. Veritabanı geçişini kontrol et.");
  }
  const counts = new Map<string, number>(((tally ?? []) as { proposal_id: string; vote_count: number | string }[])
    .map(item => [item.proposal_id, Number(item.vote_count)]));
  const proposals = rows.filter(item => item.visible || viewer?.isAdmin).map(item => ({
    id: item.id,
    name: item.name,
    createdAt: item.created_at,
    visible: item.visible,
    votes: counts.get(item.id) ?? 0,
    own: item.author_id === viewer?.id,
  }));
  return {
    phase: round.phase as NamingPhase,
    proposals,
    canSuggest: Boolean(membership.data),
    isSignedIn: Boolean(viewer),
    isAdmin: Boolean(viewer?.isAdmin),
    ownProposalId: rows.find(item => item.author_id === viewer?.id)?.id ?? null,
    votedProposalId: vote.data?.proposal_id ?? null,
  };
}
