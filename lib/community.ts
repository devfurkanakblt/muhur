import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { selectAll } from "@/lib/paginate";
import { inviteHash } from "@/lib/role-invites";
import type { Viewer } from "@/lib/data";
export type Community = { id: string; slug: string; name: string; university: string | null; city: string | null; link: string | null; status: string; review_reason: string | null; suspended_reason: string | null; created_at: string; reviewed_at: string | null };
export type Application = Community & { contact_name: string; contact_email: string; contact_phone: string };
export type CommunityMember = { user_id: string; github_login: string; role: "owner" | "organizator" };
export type PolicyDocument = { id: string; kind: string; version: string; content: string; content_sha256: string };
export type InviteSummary = { id: string; kind: string; recipient_email: string; created_at: string; expires_at: string; revoked_at: string | null; accepted_at: string | null };
export type MailSummary = { id: string; kind: string; recipient_email: string; state: string; delivery_state: string; created_at: string; last_error: string | null };
const PUBLIC = "id,slug,name,university,city,link,status,review_reason,suspended_reason,created_at,reviewed_at";
async function rows<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const result = await request; if (result.error) throw new Error("Topluluk bilgileri okunamadı. Biraz sonra tekrar dene."); return (result.data ?? []) as T[];
}
export async function getApplicationPolicies(): Promise<PolicyDocument[]> {
  const db = createAdminClient();
  const result = await rows<{ document: PolicyDocument | PolicyDocument[] | null }>(db.from("policy_requirements").select("document:policy_documents(id,kind,version,content,content_sha256)").in("kind", ["platform", "data_processing"]));
  return result.flatMap(r => Array.isArray(r.document) ? r.document : r.document ? [r.document] : []);
}
export async function getOwnApplications(viewer: Viewer): Promise<Application[]> {
  return selectAll<Application>((from, to) => createAdminClient().from("communities").select(`${PUBLIC},contact_name,contact_email,contact_phone`, { count: "exact" }).eq("applicant_id", viewer.id).order("created_at", { ascending: false }).order("id").range(from, to).overrideTypes<Application[], { merge: false }>());
}
export async function getCommunityScope(viewer: Viewer | null, slug: string) {
  if (!viewer) return null;
  const db = createAdminClient();
  const list = await rows<Community>(db.from("communities").select(PUBLIC).eq("slug", slug)); const community = list[0]; if (!community) return null;
  const members = await rows<CommunityMember>(db.from("community_members").select("user_id,github_login,role").eq("community_id", community.id).eq("user_id", viewer.id));
  const role = members[0]?.role ?? null;
  if (!role && !viewer.isHeadAdmin) return null;
  return { community, role, canManage: !!role && community.status === "onaylandi", owner: role === "owner" };
}
export async function getCommunityMembers(id: string) { return rows<CommunityMember>(createAdminClient().from("community_members").select("user_id,github_login,role").eq("community_id", id).order("joined_at")); }
export async function getCommunityInvites(id: string) { return rows<InviteSummary>(createAdminClient().from("role_invites").select("id,kind,recipient_email,created_at,expires_at,revoked_at,accepted_at").eq("community_id", id).order("created_at", { ascending: false }).limit(50)); }
export async function getEventInvites(id: string) { return rows<InviteSummary>(createAdminClient().from("role_invites").select("id,kind,recipient_email,created_at,expires_at,revoked_at,accepted_at").eq("event_id", id).order("created_at", { ascending: false }).limit(50)); }
export async function getMailSummaries(id: string, includeApplicationContact = false) {
  let query = createAdminClient().from("mail_outbox").select("id,kind,recipient_email,state,delivery_state,created_at,last_error").eq("community_id", id);
  if (!includeApplicationContact) query = query.eq("kind", "jury_invite");
  return rows<MailSummary>(query.order("created_at", { ascending: false }).limit(50));
}
export async function getAdminCommunityPage(viewer: Viewer, page: number) {
  if (!viewer.isHeadAdmin) return { items: [], count: 0 };
  const result = await createAdminClient().from("communities").select(`${PUBLIC},contact_name,contact_email,contact_phone`, { count: "exact" }).order("created_at", { ascending: false }).order("id").range(page * 20, page * 20 + 19);
  if (result.error) throw new Error("Başvurular okunamadı. Tekrar dene."); return { items: (result.data ?? []) as Application[], count: result.count ?? 0 };
}
export async function getRoleInvite(token: string) {
  const hash = inviteHash(token); if (!hash) return null;
  const result = await createAdminClient().from("role_invites").select("id,kind,community_id,event_id,expires_at,accepted_at,revoked_at").eq("token_hash", hash).maybeSingle();
  if (result.error) throw new Error("Davet okunamadı. Biraz sonra tekrar dene.");
  const inv = result.data;
  if (!inv || inv.revoked_at || inv.accepted_at || +new Date(inv.expires_at) <= Date.now()) return null;
  const target = inv.event_id ? await createAdminClient().from("events").select("id,title,slug").eq("id", inv.event_id).maybeSingle() : await createAdminClient().from("communities").select("id,name,slug").eq("id", inv.community_id).maybeSingle();
  if (target.error) throw new Error("Davet kapsamı okunamadı.");
  if (!target.data) return null;
  return { ...inv, title: "title" in target.data ? target.data.title as string : target.data.name as string, slug: target.data.slug as string };
}
