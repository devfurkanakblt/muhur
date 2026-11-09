import "server-only";
import { cache } from "react";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { ADMIN_REAUTH_MS, githubIdentity, isFreshSignIn, sessionSignedInAt } from "@/lib/identity";
import { selectAll } from "@/lib/paginate";
import { notFound } from "next/navigation";
import { isListed } from "@/lib/event-routes";

/** Okuma hatası "kayıt yok" gibi gösterilmez; sayfa hata ekranına düşer. */
function readFailed(what: string, error: { message: string }): never {
  console.error(`[veri] ${what}: ${error.message}`);
  throw new Error(`${what} okunamadı. Lütfen biraz sonra tekrar dene.`);
}

type EventRow = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  deadline: string;
  locked_at: string | null;
  announcement: string | null;
  announcement_at: string | null;
  voting: "kapali" | "acik" | "sonuclandi";
  activity_kind: "yemek" | "oyun" | null;
  activity_title: string | null;
  activity_at: string | null;
  community_id: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  community: { name: string; slug: string; city: string | null; status: string; telegram_enabled: boolean } | null;
};

/** Etkinlik satırı, bağlı olduğu toplulukla birlikte okunur. */
const EVENT_SELECT = "*, community:communities(name,slug,city,status,telegram_enabled)";

/** Yöneticinin duyurduğu yemek ya da mini oyun; bitirilene kadar sürer. */
export type Activity = { kind: "yemek" | "oyun"; title: string; at: string };

export type EventState = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  deadline: string;
  lockedAt: string | null;
  /** Etkinlik başladı mı (başlangıç saatine göre). */
  started: boolean;
  locked: boolean;
  /** Mührün referans aldığı an: erken kilitlendiyse kilit anı, değilse son tarih. */
  sealTime: string;
  announcement: string | null;
  announcementAt: string | null;
  voting: EventRow["voting"];
  activity: Activity | null;
  /** Etkinliği düzenleyen topluluk (Plan 1'de eski etkinlikler için null olabilir). */
  communityId: string | null;
  communityName: string | null;
  communitySlug: string | null;
  communityCity: string | null;
  /** Topluluk durumu: beklemede | onaylandi | reddedildi | askida. */
  communityStatus: string | null;
  /** Telegram bildirimleri yalnızca topluluğu izinliyse gider. */
  telegram: boolean;
  /** Platform tarafından askıya alındı mı (etkinlik düzeyinde). */
  suspended: boolean;
  suspendedReason: string | null;
  /** Sunucunun okuma anı; geri sayımın ilk karesi için. */
  now: number;
};

function toState(row: EventRow): EventState {
  const now = Date.now();
  const deadline = new Date(row.deadline).getTime();
  const lockedAt = row.locked_at ? new Date(row.locked_at).getTime() : null;
  const seal = lockedAt !== null && lockedAt < deadline ? lockedAt : deadline;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    startsAt: row.starts_at,
    deadline: row.deadline,
    lockedAt: row.locked_at,
    started: now >= new Date(row.starts_at).getTime(),
    locked: lockedAt !== null || now >= deadline,
    sealTime: new Date(seal).toISOString(),
    announcement: row.announcement,
    announcementAt: row.announcement_at,
    voting: row.voting,
    activity: row.activity_kind && row.activity_title && row.activity_at ? { kind: row.activity_kind, title: row.activity_title, at: row.activity_at } : null,
    communityId: row.community_id ?? null,
    communityName: row.community?.name ?? null,
    communitySlug: row.community?.slug ?? null,
    communityCity: row.community?.city ?? null,
    communityStatus: row.community?.status ?? null,
    telegram: row.community?.telegram_enabled === true,
    suspended: row.suspended_at != null,
    suspendedReason: row.suspended_reason ?? null,
    now,
  };
}

/** İsteğin sunucu anı: bir istek boyunca aynı kalır; sayfa bileşenleri saf kalır. */
export const getRequestNow = cache((): number => Date.now());

export const getEventBySlug = cache(async (slug: string): Promise<EventState | null> => {
  const db = createAdminClient();
  const { data, error } = await db.from("events").select(EVENT_SELECT).eq("slug", slug).maybeSingle();
  if (error) readFailed("Etkinlik", error);
  return data ? toState(data as EventRow) : null;
});

/** Slug'a göre etkinlik; yoksa 404. */
export const requireEventBySlug = cache(async (slug: string): Promise<EventState> => {
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  return event;
});

/** Etkinlik kimliğiyle; yetki denetimi için kaydın bağlı olduğu etkinliği okumakta kullanılır. */
export const getEventById = cache(async (id: string): Promise<EventState | null> => {
  const db = createAdminClient();
  const { data, error } = await db.from("events").select(EVENT_SELECT).eq("id", id).maybeSingle();
  if (error) readFailed("Etkinlik", error);
  return data ? toState(data as EventRow) : null;
});

export const getEvents = cache(async (): Promise<EventState[]> => {
  const db = createAdminClient();
  const { data, error } = await db.from("events").select(EVENT_SELECT).order("starts_at", { ascending: false });
  if (error) readFailed("Etkinlikler", error);
  return (data ?? []).map((r) => toState(r as EventRow));
});

/** Ana sayfada listelenebilen etkinlikler (topluluğu onaylı, askıda değil). */
export const getListedEvents = cache(async (): Promise<EventState[]> => {
  return (await getEvents()).filter(isListed);
});

/** Kullanıcının ekip üyesi olduğu etkinlikler. */
export const getViewerEvents = cache(async (userId: string): Promise<EventState[]> => {
  const db = createAdminClient();
  const { data, error } = await db.from("project_members").select("event_id").eq("user_id", userId);
  if (error) readFailed("Ekip üyelikleri", error);
  const ids = new Set((data ?? []).map((r) => r.event_id as string));
  if (ids.size === 0) return [];
  return (await getEvents()).filter((e) => ids.has(e.id));
});

export type ManagedCommunity = { id: string; slug: string; name: string; status: string; role: "owner" | "organizator" };

/** Kullanıcının sahibi ya da organizatörü olduğu topluluklar. */
export const getManagedCommunities = cache(async (userId: string): Promise<ManagedCommunity[]> => {
  const db = createAdminClient();
  const { data, error } = await db
    .from("community_members")
    .select("role, community:communities(id,slug,name,status)")
    .eq("user_id", userId);
  if (error) readFailed("Topluluk üyelikleri", error);
  type Row = { role: "owner" | "organizator"; community: { id: string; slug: string; name: string; status: string } | null };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.community)
    .map((r) => ({ ...r.community!, role: r.role }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
});

export type ManagementScope = {
  /** Sahibi ya da organizatörü olunan topluluklar. */
  communities: ManagedCommunity[];
  /** Yeni etkinlik açılabilen (onaylı) topluluklar. */
  creatable: ManagedCommunity[];
  /** Yönetilebilen ya da incelenebilen etkinlikler: head admin için hepsi, diğerleri için topluluklarınınkiler. */
  events: EventState[];
  /** Yönetim merkezinde gösterilecek bir şey var mı; yoksa merkez 404 döner ve başlıkta bağlantı görünmez. */
  open: boolean;
};

/** Yönetim merkezinin kapsamı. Yetki `getEventAccess` ile aynıdır: topluluk rolü (durumdan bağımsız) inceler, head admin hepsini inceler. */
export const getManagementScope = cache(async (viewer: Viewer): Promise<ManagementScope> => {
  const [communities, all] = await Promise.all([getManagedCommunities(viewer.id), getEvents()]);
  const ids = new Set(communities.map((c) => c.id));
  const events = viewer.isHeadAdmin ? all : all.filter((e) => e.communityId != null && ids.has(e.communityId));
  const creatable = communities.filter((c) => c.status === "onaylandi");
  return { communities, creatable, events, open: viewer.isHeadAdmin || events.length > 0 || creatable.length > 0 };
});

export type Viewer = {
  id: string;
  /** Sabit sayısal GitHub kullanıcı kimliği (yetki ve repo sahipliği buna bağlı). */
  githubId: string;
  login: string;
  avatarUrl: string | null;
  /** Platform yöneticisi (DB `platform_roles`); ADMIN_GITHUB_IDS artık yetki vermez. */
  isHeadAdmin: boolean;
};

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  // user_metadata kullanıcı tarafından değiştirilebilir; kimlik ve yetki yalnızca GitHub identity kaydından okunur.
  const github = githubIdentity(user);
  if (!github) return null;
  const { data: role, error } = await createAdminClient()
    .from("platform_roles").select("role").eq("user_id", user.id).eq("role", "head_admin").maybeSingle();
  if (error) readFailed("Platform rolü", error);
  return {
    id: user.id,
    githubId: github.githubId,
    login: github.login,
    avatarUrl: github.avatarUrl,
    isHeadAdmin: !!role,
  };
});

export type AdminSession = { signedInAt: number | null; freshUntil: number | null; fresh: boolean };

/**
 * Oturumun ne zaman açıldığı; geri alınamaz işlemler yalnızca yeni oturumla yapılır (A21).
 * Tazelik rolden bağımsızdır; yetki ayrıca `lib/access.ts` ile denetlenir.
 * JWT `getClaims` ile doğrulanır ve oturumun sahibi görüntüleyenle aynı olmalıdır.
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const viewer = await getViewer();
  if (!viewer) return null;
  const { data, error } = await (await createClient()).auth.getClaims();
  if (error || !data || data.claims.sub !== viewer.id) return { signedInAt: null, freshUntil: null, fresh: false };
  const signedInAt = sessionSignedInAt(data.claims.amr);
  return {
    signedInAt,
    freshUntil: signedInAt === null ? null : signedInAt + ADMIN_REAUTH_MS,
    fresh: isFreshSignIn(signedInAt, Date.now()),
  };
});

const EXHIBIT_COLUMNS =
  "id, event_id, exhibit_no, name, team_name, summary, demo_url, logo_path, repo_full_name, repo_url, created_at, last_pushed_at, frozen_sha, frozen_at, frozen_method, archive_sha256, archive_bytes, accepted_sha, accepted_at, accepted_branch, freeze_error";

export type Exhibit = {
  id: string;
  event_id: string;
  exhibit_no: number;
  name: string;
  team_name: string;
  summary: string;
  demo_url: string | null;
  accepted_sha: string | null;
  accepted_at: string | null;
  accepted_branch: string | null;
  freeze_error: string | null;
  logo_path: string | null;
  repo_full_name: string;
  repo_url: string;
  created_at: string;
  last_pushed_at: string | null;
  frozen_sha: string | null;
  frozen_at: string | null;
  frozen_method: string | null;
  archive_sha256: string | null;
  archive_bytes: number | null;
};

export const getExhibits = cache(async (eventId: string): Promise<Exhibit[]> => {
  const db = createAdminClient();
  try {
    return await selectAll<Exhibit>((from, to) =>
      db.from("projects").select(EXHIBIT_COLUMNS, { count: "exact" }).eq("event_id", eventId)
        .order("exhibit_no", { ascending: true }).range(from, to).overrideTypes<Exhibit[], { merge: false }>());
  } catch (e) {
    readFailed("Eserler", e as Error);
  }
});

export const getExhibit = cache(async (eventId: string, no: number): Promise<Exhibit | null> => {
  const db = createAdminClient();
  if (!Number.isSafeInteger(no) || no < 1) return null;
  const { data, error } = await db.from("projects").select(EXHIBIT_COLUMNS).eq("event_id", eventId).eq("exhibit_no", no).maybeSingle();
  if (error) readFailed("Eser", error);
  return (data as Exhibit) ?? null;
});

export type Member = {
  user_id: string;
  github_login: string;
  avatar_url: string | null;
  role: "owner" | "member";
};

export type OwnProject = Exhibit & {
  repo_id: number;
  invite_code: string;
  default_branch: string;
  archive_path: string | null;
  health_issues: string[];
  health_checked_at: string | null;
  repo_head_sha: string | null;
  delivery_error: string | null;
  accepted_archive_sha256: string | null;
  accepted_archive_bytes: number | null;
  members: Member[];
};

/** Kullanıcının bu etkinlikteki eseri. */
export const getOwnProject = cache(async (userId: string, eventId: string): Promise<OwnProject | null> => {
  const db = createAdminClient();
  const { data: membership, error: memberError } = await db
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (memberError) readFailed("Ekip üyeliği", memberError);
  if (!membership) return null;
  const { data, error } = await db
    .from("projects")
    .select("*, members:project_members(user_id, github_login, avatar_url, role)")
    .eq("id", membership.project_id)
    .maybeSingle();
  if (error) readFailed("Proje", error);
  return (data as OwnProject) ?? null;
});

export const getMembers = cache(async (projectId: string): Promise<Member[]> => {
  const db = createAdminClient();
  const { data, error } = await db.from("project_members").select("user_id, github_login, avatar_url, role").eq("project_id", projectId).order("joined_at");
  if (error) readFailed("Ekip", error);
  return (data ?? []) as Member[];
});

export type VoteState = { myVote: string | null; tallies: Record<string, number> | null };

/** Kullanıcının oyu; sonuçlar yalnızca oylama sonuçlandığında, DB'de sayılarak döner. */
export const getVotes = cache(async (event: EventState, userId: string | null): Promise<VoteState> => {
  if (event.voting === "kapali") return { myVote: null, tallies: null };
  const db = createAdminClient();
  let myVote: string | null = null;
  if (userId) {
    const { data, error } = await db.from("votes").select("project_id").eq("event_id", event.id).eq("user_id", userId).maybeSingle();
    if (error) readFailed("Oyun", error);
    myVote = data?.project_id ?? null;
  }
  let tallies: Record<string, number> | null = null;
  if (event.voting === "sonuclandi") {
    const { data, error } = await db.rpc("vote_tallies", { p_event: event.id });
    if (error) readFailed("Oylama sonuçları", error);
    tallies = (data ?? {}) as Record<string, number>;
  }
  return { myVote, tallies };
});

export function logoUrl(path: string | null) {
  if (!path) return null;
  return `${env.supabaseUrl}/storage/v1/object/public/logos/${path}`;
}

export function exhibitPath(slug: string, no: number) {
  return `/sergi/${slug}/${no}`;
}

export type TimelineEntry = { id: string; kind: string; detail: string | null; occurred_at: string };
export const getTimeline = cache(async (projectId: string): Promise<TimelineEntry[]> => {
  const { data, error } = await createAdminClient().from("project_timeline")
    .select("id, kind, detail, occurred_at").eq("project_id", projectId).order("occurred_at", { ascending: false }).limit(30);
  if (error) throw new Error("Teslim geçmişi okunamadı.");
  return data ?? [];
});

export type ProjectJob = { id: string; kind: string; state: string; attempts: number; error: string | null; created_at: string; next_attempt_at: string };
export const getProjectJobs = cache(async (projectId: string): Promise<ProjectJob[]> => {
  const { data, error } = await createAdminClient().from("delivery_jobs")
    .select("id, kind, state, attempts, error, created_at, next_attempt_at").eq("project_id", projectId)
    .order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error("Teslim işleri okunamadı.");
  return data ?? [];
});

export type Award = { id: string; event_id: string; project_id: string; title: string; reason: string };
export const getAwards = cache(async (eventId: string): Promise<Award[]> => {
  const { data, error } = await createAdminClient().from("awards").select("id, event_id, project_id, title, reason")
    .eq("event_id", eventId).order("created_at");
  if (error) throw new Error("Ödüller okunamadı.");
  return data ?? [];
});

// ---------------------------------------------------------------------------- gizem avcıları

export type MysteryHunter = { user_id: string; github_login: string; found_at: string };

/** Etkinlikte gizemi çözenler, bulma sırasıyla. Yalnızca yönetim ve rozet için sunucuda okunur. */
export async function getMysteryHunters(eventId: string): Promise<MysteryHunter[]> {
  const { data, error } = await createAdminClient()
    .from("mystery_hunters")
    .select("user_id, github_login, found_at")
    .eq("event_id", eventId)
    .order("found_at");
  if (error) {
    console.error("[gizem] okunamadı:", error.message);
    return [];
  }
  return data ?? [];
}

/** Rozet takıma aittir: ekipten biri gizemi çözmüşse proje rozeti açılır. */
export async function projectHasMystery(eventId: string, projectId: string) {
  const db = createAdminClient();
  const { data: members } = await db.from("project_members").select("user_id").eq("project_id", projectId);
  const ids = (members ?? []).map((m) => m.user_id);
  if (!ids.length) return false;
  const { count, error } = await db
    .from("mystery_hunters")
    .select("user_id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("user_id", ids);
  if (error) console.error("[gizem] rozet okunamadı:", error.message);
  return (count ?? 0) > 0;
}
