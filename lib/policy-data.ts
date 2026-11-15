import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import { isPolicyKind, type PolicyKind } from "@/lib/policies";

/** Yalnız kimlik/tür/sürüm; metin ve hash belge sayfasında okunur. */
export type PolicyRef = { id: string; kind: PolicyKind; version: string };
export type EventTerms = { id: string; version: number; rules_url: string; privacy_url: string; content_sha256: string | null };

function failed(what: string, error: { message: string }): never {
  console.error(`[sözleşme] ${what}: ${error.message}`);
  throw new Error(`${what} okunamadı. Lütfen biraz sonra tekrar dene.`);
}
const refs = (rows: unknown): PolicyRef[] => ((rows ?? []) as { id: string; kind: string; version: string }[])
  .filter(r => isPolicyKind(r.kind)).map(r => ({ id: r.id, kind: r.kind as PolicyKind, version: r.version }));

/** Zorunluluk migration ile açılır (0018); uygulama yalnız okur. */
export const policyEnforced = cache(async (): Promise<boolean> => {
  const { data, error } = await createAdminClient().rpc("policy_enforcement_enabled");
  if (error) failed("Sözleşme ayarı", error);
  return data === true;
});

export type ManagementConsent = {
  /** Platform ve veri işleme belgelerinin ikisi de yayınlandı mı. */
  configured: boolean;
  documents: PolicyRef[];
  missing: PolicyRef[];
  /** Eksik onay yönetim yazmasını şu an durduruyor mu (zorunluluk açık + eksik var). */
  blocking: boolean;
};

/** Görüntüleyenin bu topluluk adına onaylaması gereken güncel yönetim belgeleri (rolü olduğu varsayılır). */
export const getManagementConsent = cache(async (userId: string, communityId: string): Promise<ManagementConsent> => {
  const db = createAdminClient();
  const [documents, missing, enforced] = await Promise.all([
    db.rpc("management_policy_documents"),
    db.rpc("missing_management_policies", { p_actor: userId, p_community: communityId }),
    policyEnforced(),
  ]);
  if (documents.error) failed("Güncel belgeler", documents.error);
  if (missing.error) failed("Onay durumu", missing.error);
  const docs = refs(documents.data), lacking = refs(missing.data);
  const configured = docs.length === 2;
  return { configured, documents: docs, missing: configured ? lacking : [], blocking: enforced && (!configured || lacking.length > 0) };
});

export type ParticipantTerms = {
  /** Bu etkinlikte daha önce kaydı var (kabul ya da legacy): yeniden onay istenmez. */
  enrolled: boolean;
  document: PolicyRef | null;
  terms: EventTerms | null;
};

/** Katılımcının etkinliğe ilk kaydında göreceği iki ayrı onay. */
export const getParticipantTerms = cache(async (userId: string, eventId: string): Promise<ParticipantTerms> => {
  const db = createAdminClient();
  const [enrollment, requirement, event] = await Promise.all([
    db.from("participant_enrollments").select("source").eq("user_id", userId).eq("event_id", eventId).maybeSingle(),
    db.from("policy_requirements").select("document:policy_documents(id,kind,version,status)").eq("kind", "participant").maybeSingle(),
    db.from("events").select("terms:event_terms_versions!events_current_terms_own(id,version,rules_url,privacy_url,content_sha256)").eq("id", eventId).maybeSingle(),
  ]);
  if (enrollment.error) failed("Etkinlik kaydı", enrollment.error);
  if (requirement.error) failed("Katılımcı koşulları", requirement.error);
  if (event.error) failed("Etkinlik kuralları", event.error);
  const raw = requirement.data?.document as unknown as { id: string; kind: string; version: string; status: string } | null;
  const document = raw && raw.status === "published" ? refs([raw])[0] ?? null : null;
  const terms = (event.data?.terms as unknown as EventTerms | null) ?? null;
  return { enrolled: !!enrollment.data, document, terms };
});

export type AcceptanceRow = { id: string; kind: PolicyKind; version: string; scope: "community" | "event"; scopeName: string; acceptedAt: string };
export type TermsAcceptanceRow = { id: string; eventTitle: string; version: number; rulesUrl: string; privacyUrl: string; contentSha256: string | null; acceptedAt: string };
export type EnrollmentRow = { eventTitle: string; source: "accepted" | "legacy"; createdAt: string };

/** Yalnız görüntüleyenin kendi kabul geçmişi; başka oturuma ya da kişiye açılmaz. */
export async function getOwnPolicyHistory(userId: string) {
  const db = createAdminClient();
  const subject = await db.from("policy_subjects").select("id").eq("user_id", userId).maybeSingle();
  if (subject.error) failed("Onay geçmişi", subject.error);
  const [acceptances, terms, enrollments] = await Promise.all([
    subject.data
      ? db.from("policy_acceptances").select("id,scope_kind,scope_id,accepted_at,document:policy_documents(kind,version)").eq("subject_id", subject.data.id).order("accepted_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null }),
    db.from("event_terms_acceptances").select("id,accepted_at,event:events(title),terms:event_terms_versions(version,rules_url,privacy_url,content_sha256)").eq("user_id", userId).order("accepted_at", { ascending: false }).limit(200),
    db.from("participant_enrollments").select("source,created_at,event:events(title)").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
  ]);
  if (acceptances.error) failed("Onay geçmişi", acceptances.error);
  if (terms.error) failed("Etkinlik kuralı onayları", terms.error);
  if (enrollments.error) failed("Etkinlik kayıtları", enrollments.error);
  type A = { id: string; scope_kind: "community" | "event"; scope_id: string; accepted_at: string; document: { kind: string; version: string } | null };
  const rows = (acceptances.data ?? []) as unknown as A[];
  const ids = (kind: string) => [...new Set(rows.filter(r => r.scope_kind === kind).map(r => r.scope_id))];
  const [communities, events] = await Promise.all([
    ids("community").length ? db.from("communities").select("id,name").in("id", ids("community")) : Promise.resolve({ data: [], error: null }),
    ids("event").length ? db.from("events").select("id,title").in("id", ids("event")) : Promise.resolve({ data: [], error: null }),
  ]);
  if (communities.error || events.error) failed("Onay kapsamları", (communities.error ?? events.error)!);
  const names = new Map<string, string>([
    ...((communities.data ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name] as [string, string]),
    ...((events.data ?? []) as { id: string; title: string }[]).map(e => [e.id, e.title] as [string, string]),
  ]);
  type T = { id: string; accepted_at: string; event: { title: string } | null; terms: { version: number; rules_url: string; privacy_url: string; content_sha256: string | null } | null };
  type E = { source: "accepted" | "legacy"; created_at: string; event: { title: string } | null };
  return {
    acceptances: rows.filter(r => r.document && isPolicyKind(r.document.kind)).map<AcceptanceRow>(r => ({
      id: r.id, kind: r.document!.kind as PolicyKind, version: r.document!.version, scope: r.scope_kind,
      scopeName: names.get(r.scope_id) ?? "Kaldırılmış kapsam", acceptedAt: r.accepted_at,
    })),
    terms: ((terms.data ?? []) as unknown as T[]).filter(t => t.terms).map<TermsAcceptanceRow>(t => ({
      id: t.id, eventTitle: t.event?.title ?? "Etkinlik", version: t.terms!.version, rulesUrl: t.terms!.rules_url,
      privacyUrl: t.terms!.privacy_url, contentSha256: t.terms!.content_sha256, acceptedAt: t.accepted_at,
    })),
    enrollments: ((enrollments.data ?? []) as unknown as E[]).map<EnrollmentRow>(e => ({ eventTitle: e.event?.title ?? "Etkinlik", source: e.source, createdAt: e.created_at })),
  };
}

export type ManagementEvidence = { userId: string; login: string; role: "owner" | "organizator"; accepted: { kind: PolicyKind; version: string; acceptedAt: string }[] };

/**
 * Sahip yalnız kendi topluluğu adına verilmiş yönetim onaylarını görür (topluluk ekibi için).
 * Katılımcıların etkinlik onayları burada gösterilmez.
 */
export async function getCommunityManagementEvidence(communityId: string): Promise<ManagementEvidence[]> {
  const db = createAdminClient();
  const members = await db.from("community_members").select("user_id,github_login,role").eq("community_id", communityId).order("joined_at");
  if (members.error) failed("Topluluk ekibi", members.error);
  const list = (members.data ?? []) as { user_id: string; github_login: string; role: "owner" | "organizator" }[];
  if (!list.length) return [];
  const subjects = await db.from("policy_subjects").select("id,user_id").in("user_id", list.map(m => m.user_id));
  if (subjects.error) failed("Onay kanıtı", subjects.error);
  const subjectOf = new Map(((subjects.data ?? []) as { id: string; user_id: string }[]).map(s => [s.id, s.user_id]));
  const accepted = subjectOf.size
    ? await db.from("policy_acceptances").select("subject_id,accepted_at,document:policy_documents(kind,version)").eq("scope_kind", "community").eq("scope_id", communityId).in("subject_id", [...subjectOf.keys()]).order("accepted_at", { ascending: false })
    : { data: [], error: null };
  if (accepted.error) failed("Onay kanıtı", accepted.error);
  type R = { subject_id: string; accepted_at: string; document: { kind: string; version: string } | null };
  const byUser = new Map<string, ManagementEvidence["accepted"]>();
  for (const r of (accepted.data ?? []) as unknown as R[]) {
    const user = subjectOf.get(r.subject_id);
    if (!user || !r.document || !isPolicyKind(r.document.kind)) continue;
    byUser.set(user, [...(byUser.get(user) ?? []), { kind: r.document.kind, version: r.document.version, acceptedAt: r.accepted_at }]);
  }
  return list.map(m => ({ userId: m.user_id, login: m.github_login, role: m.role, accepted: byUser.get(m.user_id) ?? [] }));
}

export type PolicyAdminDocument = PolicyRef & { status: "draft" | "published" | "retired"; content_sha256: string; published_at: string | null; created_at: string; current: boolean };

/** Head admin belge yönetimi: taslaklar ve geçerli sürümler (metin hariç). */
export async function getPolicyAdminDocuments(): Promise<PolicyAdminDocument[]> {
  const db = createAdminClient();
  const [docs, requirements] = await Promise.all([
    db.from("policy_documents").select("id,kind,version,status,content_sha256,published_at,created_at").order("created_at", { ascending: false }).limit(100),
    db.from("policy_requirements").select("kind,document_id"),
  ]);
  if (docs.error) failed("Belgeler", docs.error);
  if (requirements.error) failed("Geçerli sürümler", requirements.error);
  const current = new Set(((requirements.data ?? []) as { document_id: string }[]).map(r => r.document_id));
  return ((docs.data ?? []) as Omit<PolicyAdminDocument, "current">[]).filter(d => isPolicyKind(d.kind)).map(d => ({ ...d, current: current.has(d.id) }));
}

export type ConsentPlan =
  | { state: "enrolled" }
  | { state: "ready"; consent: { document: PolicyRef; terms: { id: string; version: number; rulesUrl: string; privacyUrl: string } } }
  | { state: "unavailable"; message: string };

/** Kayıt formunun ne göstereceği: önceden kaydı varsa onay yok; belge/kural eksikse açık yapılandırma mesajı (sessiz atlama yok). */
export function consentPlan(t: ParticipantTerms): ConsentPlan {
  if (t.enrolled) return { state: "enrolled" };
  if (!t.document) return { state: "unavailable", message: "Katılımcı koşulları henüz yayınlanmadı; kayıtlar kısa süreliğine kapalı. Biraz sonra tekrar dene." };
  if (!t.terms) return { state: "unavailable", message: "Bu etkinliğin kuralları ve aydınlatma metni henüz yayınlanmadı. Kayıt için organizatörün bunları eklemesi gerekiyor." };
  return { state: "ready", consent: { document: t.document, terms: { id: t.terms.id, version: t.terms.version, rulesUrl: t.terms.rules_url, privacyUrl: t.terms.privacy_url } } };
}

/** Güncel yönetim belgeleri (platform + veri işleme); ikisi de yayınlanmadıysa boş liste. */
export async function getManagementDocuments(): Promise<PolicyRef[]> {
  const { data, error } = await createAdminClient().rpc("management_policy_documents");
  if (error) failed("Güncel belgeler", error);
  const docs = refs(data);
  return docs.length === 2 ? docs : [];
}
