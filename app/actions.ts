"use server";

import { createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { exhibitPath, getAdminSession, getEventById, getOwnProject, getViewer, getGithubViewer, type EventState, type Viewer } from "@/lib/data";
import { eventPath, eventUrl } from "@/lib/event-routes";
import { requireEventAction } from "@/lib/access";
import { ASKIDA_MESAJI, YARISAMAZ_MESAJI, YETKISIZ_MESAJI, type EventAction } from "@/lib/authz";
import { canClaimRepo, getHeadSha, getRepo, getRepoById, GithubError, parseRepoInput } from "@/lib/github";
import { checkHealth, freezeAll, getEventRow, lockNow, tick } from "@/lib/freeze";
import { processProjectJobs, retrySeal } from "@/lib/delivery";
import { safeDemoUrl } from "@/lib/delivery-policy";
import { normalizeLogo, type NormalizedLogo } from "@/lib/logo-image";
import { notifyEvent, tg } from "@/lib/notify";
import { env } from "@/lib/env";
import { httpsLink } from "@/lib/community-input";
import { safeAuthNext } from "@/lib/auth-redirect";
import { claimOnce, releaseOnce, requestKey } from "@/lib/once";
import { isMysteryAnswer, mysteryOpen } from "@/lib/mystery";
import { announceAward, announcePeoplesChoice } from "@/lib/winners";

/** notice: hata olmayan bilgi (ör. "bu commit zaten kabul edilmiş"); nötr gösterilir. */
export type FormState = { error?: string; ok?: boolean; status?: string; notice?: string } | undefined;

const LOCKED_MSG = "Teslim süresi doldu. Sistem kilitli, değişiklik kabul edilmiyor.";

function dbError(message: string) {
  // Yetki ve askı önekleri (0012_topluluklar): asıl zorlama DB'dedir, uygulama Türkçe mesaja çevirir.
  if (message.includes("ASKIDA:")) return ASKIDA_MESAJI;
  if (message.includes("YARISAMAZ:")) return YARISAMAZ_MESAJI;
  if (message.includes("YETKI:")) return YETKISIZ_MESAJI;
  if (message.includes("VOTING:")) return message.split("VOTING:")[1].split("\n")[0].trim();
  if (message.includes("LOCKED")) return LOCKED_MSG;
  if (message.includes("MEMBER:")) return "Zaten bir projenin ekibindesin.";
  if (message.includes("TEAM:")) return message.split("TEAM:")[1].split("\n")[0].trim();
  if (message.includes("projects_event_id_repo_id_key")) return "Bu repo zaten başka bir ekip tarafından içe aktarılmış.";
  if (message.includes("project_members_event_id_user_id_key")) return "Zaten bir projenin ekibindesin.";
  if (message.includes("events_slug_key")) return "Bu adres kısaltması başka bir etkinlikte kullanılıyor.";
  return "Bir şeyler ters gitti. Lütfen tekrar dene.";
}

// ---------------------------------------------------------------------------- etkinlik

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_MISSING = "Etkinlik bulunamadı.";

/**
 * Eylemin etkinliği formdan (gizli `event` alanı) ya da bağlı argümandan gelir; "güncel etkinlik" yoktur.
 * Bu değer istemciden gelir ve değiştirilebilir: yalnızca hangi etkinlik üzerinde çalışılacağını söyler.
 * Yönetim eylemleri yetkiyi bu etkinlik için `authorize` ile yeniden hesaplar; katılımcı eylemleri
 * bu etkinliğin kilit, son teslim ve askı kurallarıyla çalışır (asıl zorlama DB'dedir).
 */
async function loadEvent(raw: unknown): Promise<EventState | string> {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!UUID_RE.test(id)) return EVENT_MISSING;
  return (await getEventById(id)) ?? EVENT_MISSING;
}

/** Etkinliğin bütün yüzeyleri ve etkinlik listesini gösteren ana sayfa tazelenir. */
function revalidateEvent(event: EventState) {
  revalidatePath(eventPath(event.slug), "layout");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------- auth

export async function signIn(formData: FormData) {
  const next = safeAuthNext(formData.get("next"));
  const provider = formData.get("provider") ?? "github";
  if (provider !== "github" && provider !== "linkedin_oidc") redirect("/?hata=giris");
  if (provider === "linkedin_oidc" && !/^\/katil\/[A-Za-z0-9_-]{43}$/.test(next)) redirect("/?hata=giris");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${env.siteUrl}/auth/callback${formData.has("next") ? `?next=${encodeURIComponent(next)}` : ""}`,
      scopes: provider === "github" ? "read:user read:org" : "openid profile email",
    },
  });
  if (error || !data.url) redirect("/?hata=giris");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete("gh_token");
  redirect("/");
}

// ---------------------------------------------------------------------------- doğrulama

type Fields = { name: string; team: string; summary: string; demo: string | null };

function readFields(formData: FormData): Fields | string {
  const name = String(formData.get("name") ?? "").trim();
  const team = String(formData.get("team") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  if (name.length < 2 || name.length > 60) return "Proje adı 2 ile 60 karakter arasında olmalı.";
  if (team.length < 2 || team.length > 60) return "Ekip adı 2 ile 60 karakter arasında olmalı.";
  if (summary.length < 10 || summary.length > 280) return "Özet 10 ile 280 karakter arasında olmalı.";
  try {
    return { name, team, summary, demo: safeDemoUrl(String(formData.get("demo") ?? "")) };
  } catch (e) { return e instanceof Error ? e.message : "Demo bağlantısı geçersiz."; }
}

/** Logo tarayıcıda da denetlenir; burada tarayıcı atlatılsa bile görsel çözülüp yeniden kodlanır. */
async function readLogo(formData: FormData, required: boolean): Promise<NormalizedLogo | null | string> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return required ? "Bir logo yükle." : null;
  return normalizeLogo(new Uint8Array(await file.arrayBuffer()), file.type);
}

async function uploadLogo(projectId: string, logo: NormalizedLogo) {
  const db = createAdminClient();
  const path = `${projectId}/${randomBytes(6).toString("hex")}.${logo.ext}`;
  const { error } = await db.storage.from("logos").upload(path, logo.bytes, { contentType: logo.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** DB yazması başarısızsa yeni yüklenen dosya depoda sahipsiz kalmaz. */
async function removeLogo(path: string | null | undefined) {
  if (!path) return;
  const { error } = await createAdminClient().storage.from("logos").remove([path]);
  if (error) console.error("[logo] silinemedi; depo temizliği yeniden dener:", error.message);
}

// ---------------------------------------------------------------------------- proje

export async function createProject(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getGithubViewer();
  if (!viewer) return { error: "Önce GitHub ile giriş yap." };
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  if (event.locked) return { error: LOCKED_MSG };
  if (await getOwnProject(viewer.id, event.id)) return { error: "Zaten bir projenin ekibindesin." };

  const fullName = parseRepoInput(String(formData.get("repo") ?? ""));
  if (!fullName) return { error: "Geçerli bir GitHub reposu seç." };
  const fields = readFields(formData);
  if (typeof fields === "string") return { error: fields };
  const logo = await readLogo(formData, true);
  if (typeof logo === "string") return { error: logo };

  const userToken = (await cookies()).get("gh_token")?.value;
  let repo;
  try {
    repo = await getRepo(fullName);
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) return { error: "Repo bulunamadı. Public olduğundan emin ol." };
    return { error: "GitHub'a ulaşılamadı. Biraz sonra tekrar dene." };
  }
  if (repo.private) return { error: "Hackathon kuralları gereği yalnızca public repolar kabul ediliyor." };
  const claim = await canClaimRepo(repo, viewer.githubId, userToken);
  if (claim === "token-required")
    return { error: "GitHub oturumunun süresi dolmuş. Çıkış yapıp yeniden giriş yaptıktan sonra tekrar dene." };
  if (claim === "denied")
    return { error: "Bu repoya yazma yetkin görünmüyor. Repo sahibi ya da ekip üyesi içe aktarmalı." };

  const db = createAdminClient();
  let sha: string | null;
  try { sha = await getHeadSha(repo); } catch { return { error: "GitHub'a ulaşılamadı. Tekrar dene." }; }
  const { data, error } = await db.rpc("register_project", {
    p_event: event.id, p_user: viewer.id, p_login: viewer.login, p_avatar: viewer.avatarUrl,
    p_name: fields.name, p_team: fields.team, p_summary: fields.summary, p_repo_id: repo.id,
    p_repo_name: repo.full_name, p_repo_url: repo.html_url, p_branch: repo.default_branch,
    p_demo: fields.demo, p_sha: sha,
  }).single();
  const project = data as { id: string; event_id: string; exhibit_no: number; name: string; team_name: string; repo_id: number; repo_full_name: string; frozen_sha: string | null } | null;
  if (error || !project) return { error: dbError(error?.message ?? "") };

  let uploaded: string | null = null;
  try {
    uploaded = await uploadLogo(project.id, logo!);
    const { error: logoError } = await db.from("projects").update({ logo_path: uploaded }).eq("id", project.id);
    if (logoError) throw new Error(logoError.message);
  } catch (e) {
    // Logo yüklenemese de kayıt geçerli; panelden yeniden yüklenebilir.
    console.error("[logo] ilk kayıt:", e instanceof Error ? e.message : e);
    await removeLogo(uploaded);
  }

  after(async () => {
    await processProjectJobs(project.id);
    await checkHealth(project, await getEventRow(event.id));
    await notifyEvent(event, [
      `🖼 ${tg.b("Vitrine yeni eser")} · No. ${String(project.exhibit_no).padStart(3, "0")}`,
      `${tg.b(fields.name)} · ${tg.text(fields.team)}`,
      tg.link(`${env.siteUrl}${exhibitPath(event.slug, project.exhibit_no)}`, repo.full_name),
    ], "vitrinde");
  });

  revalidateEvent(event);
  redirect(`${eventPath(event.slug, "panel")}?kayit=tamam`);
}

export async function updateProject(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getGithubViewer();
  if (!viewer) return { error: "Önce GitHub ile giriş yap." };
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  if (event.locked) return { error: LOCKED_MSG };
  const project = await getOwnProject(viewer.id, event.id);
  if (!project) return { error: "Kayıtlı bir projen yok." };

  const fields = readFields(formData);
  if (typeof fields === "string") return { error: fields };
  const logo = await readLogo(formData, false);
  if (typeof logo === "string") return { error: logo };
  // Çift tıklama ya da iki sekmeden gelen aynı kayıt bir kez işlenir; ikincisi logoyu yeniden yüklemez.
  const once = requestKey("proje", project.id, fields.name, fields.team, fields.summary, fields.demo,
    logo ? createHash("sha256").update(logo.bytes).digest("hex") : null);
  if (!(await claimOnce(once, 30))) return { ok: true };

  let uploaded: string | null = null;
  if (logo) {
    try {
      uploaded = await uploadLogo(project.id, logo);
    } catch {
      await releaseOnce(once);
      return { error: "Logo yüklenemedi." };
    }
  }
  // Üyelik ve kilit, yazma ile aynı transaction içinde denetlenir; değiştirilen eski logonun yolu döner.
  const { data: replaced, error } = await createAdminClient().rpc("update_project", {
    p_project: project.id, p_actor: viewer.id, p_name: fields.name, p_team: fields.team, p_summary: fields.summary,
    p_demo: fields.demo, p_logo: uploaded, p_replace_logo: !!uploaded,
  });
  if (error) {
    await Promise.all([removeLogo(uploaded), releaseOnce(once)]);
    return { error: dbError(error.message) };
  }
  await removeLogo(replaced as string | null);

  revalidateEvent(event);
  return { ok: true };
}

export async function withdrawProject(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getGithubViewer();
  if (!viewer) redirect("/");
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  if (event.locked) redirect(eventPath(event.slug, "panel"));
  const project = await getOwnProject(viewer.id, event.id);
  if (!project || project.members.find((m) => m.user_id === viewer.id)?.role !== "owner") redirect(eventPath(event.slug, "panel"));
  if (String(formData.get("confirmation") ?? "").trim() !== project.name) {
    return { error: "Geri çekmek için proje adını aynen yaz." };
  }
  const db = createAdminClient();
  // Kuruculuk ve onay adı silme anında DB'de yeniden denetlenir; depodan silinecek yollar aynı işlemde toplanır.
  const { data, error } = await db.rpc("withdraw_project", {
    p_project: project.id, p_actor: viewer.id, p_confirmation: String(formData.get("confirmation") ?? ""),
  });
  if (error) return { error: dbError(error.message) };
  const removed = data as { archives: string[]; logo: string | null };
  // Dosya silinemezse depo temizliği sahipsiz dosyayı daha sonra kaldırır.
  if (removed.archives.length) {
    const { error: archiveError } = await db.storage.from("archives").remove(removed.archives);
    if (archiveError) console.error("[geri çekme] arşivler silinemedi:", archiveError.message);
  }
  await removeLogo(removed.logo);
  revalidateEvent(event);
  redirect(eventPath(event.slug, "panel"));
}

/** Panelden "Yeniden kontrol et": eserin repo sağlığını hemen yeniler. */
export async function recheckHealth(eventId: string) {
  const viewer = await getGithubViewer();
  if (!viewer) return;
  const event = await loadEvent(eventId);
  if (typeof event === "string") return;
  const project = await getOwnProject(viewer.id, event.id);
  if (!project) return;
  // Ekipteki herkes aynı anda bassa da GitHub'a 30 sn'de bir kez gidilir.
  if (await claimOnce(requestKey("saglik", project.id), 30)) await checkHealth(project, await getEventRow(event.id));
  revalidatePath(eventPath(event.slug, "panel"));
}

export async function submitVersion(eventId: string, previous: FormState): Promise<FormState> {
  void previous;
  const viewer = await getGithubViewer();
  if (!viewer) return { error: "Önce GitHub ile giriş yap." };
  const event = await loadEvent(eventId);
  if (typeof event === "string") return { error: event };
  if (event.locked) return { error: LOCKED_MSG };
  const project = await getOwnProject(viewer.id, event.id);
  if (!project) return { error: "Kayıtlı bir projen yok." };
  try {
    const repo = await getRepoById(project.repo_id);
    if (repo.private) return { error: "Repo public olmalı." };
    const sha = await getHeadSha(repo);
    if (!sha) return { error: "Varsayılan dal boş. Önce kodunu GitHub'a push et." };
    const { data, error } = await createAdminClient().rpc("enqueue_submission", {
      p_project: project.id, p_user: viewer.id, p_sha: sha, p_branch: repo.default_branch, p_repo_name: repo.full_name,
    });
    if (error) return { error: dbError(error.message) };
    const result = data as SubmissionResult;
    revalidatePath(eventPath(event.slug, "panel"));
    const message = submissionMessage(result);
    if (result.status === "already_accepted" || result.status === "busy") return { notice: message, status: result.status };
    if (result.status !== "queued") return { error: message, status: result.status };
    after(() => processProjectJobs(project.id));
    return { ok: true, status: result.status, ...(result.supersededSha ? { notice: message } : {}) };
  } catch { return { error: "GitHub'a ulaşılamadı. Kabul edilmiş önceki sürümün korunuyor; tekrar dene." }; }
}

type SubmissionResult = {
  status: "queued" | "busy" | "already_accepted" | "rate_limited";
  requestedSha: string; queuedSha: string | null; acceptedSha: string | null; retryAt?: string; supersededSha?: string | null;
};

const short = (sha: string | null | undefined) => (sha ?? "").slice(0, 7);

/** İstenen, sıradaki ve kabul edilmiş SHA birbirinden ayrı söylenir; eski iş yeni sürüm gibi gösterilmez. */
function submissionMessage(r: SubmissionResult) {
  switch (r.status) {
    case "queued":
      return r.supersededSha
        ? `${short(r.requestedSha)} sürümü sıraya alındı; bekleyen ${short(r.supersededSha)} sürümünün yerini aldı.`
        : `${short(r.requestedSha)} sürümü sıraya alındı.`;
    case "already_accepted":
      return `Repodaki son commit (${short(r.requestedSha)}) zaten kabul edilmiş. Yeni bir değişiklik push etmediysen tekrar teslim etmen gerekmiyor.`;
    case "busy":
      return `Önceki sürüm (${short(r.queuedSha)}) hâlâ işleniyor; yeni sürüm (${short(r.requestedSha)}) sıraya alınmadı. İşlem bitince tekrar teslim et.`;
    case "rate_limited": {
      const at = r.retryAt ? new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(new Date(r.retryAt)) : null;
      return `10 dakikada en fazla 6 teslim yapılabilir.${at ? ` ${at} sonrasında tekrar dene.` : ""} Kabul edilmiş son sürümün korunuyor.`;
    }
  }
}

export async function transferOwner(_: FormState, formData: FormData): Promise<FormState> {
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  const viewer = await getGithubViewer();
  const project = await ownedProject(event);
  if (!viewer || !project) return { error: "Bu işlem yalnızca kurucu tarafından, teslim açıkken yapılabilir." };
  const target = String(formData.get("target") ?? "");
  if (!project.members.some(m => m.user_id === target && m.role === "member")) return { error: "Ekipten bir üye seç." };
  const db = createAdminClient();
  const { error } = await db.rpc("transfer_project_owner", { p_project: project.id, p_owner: viewer.id, p_target: target });
  if (error) {
    // Eş istek (çift tıklama, ikinci sekme) ilkinden sonra reddedilir; hedef zaten kurucuysa işlem tamamdır.
    const { data: now } = await db.from("project_members").select("role").eq("project_id", project.id).eq("user_id", target).maybeSingle();
    if (now?.role !== "owner") return { error: dbError(error.message) };
  }
  revalidatePath(eventPath(event.slug, "panel"));
  return { ok: true };
}

// ---------------------------------------------------------------------------- ekip

export async function joinProject(_: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const viewer = await getGithubViewer();
  if (!viewer) return { error: "Önce GitHub ile giriş yap." };
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  if (event.locked) return { error: LOCKED_MSG };
  const db = createAdminClient();
  // Kodun projesi bu etkinliğe ait olmalı; aşağıdaki denetimler başka bir etkinliğin kurallarıyla yapılmasın.
  const { data: invited } = await db.from("projects").select("event_id").eq("invite_code", code).maybeSingle();
  if (invited?.event_id !== event.id) return { error: "Davet bağlantısı geçersiz ya da yenilenmiş." };
  if (await getOwnProject(viewer.id, event.id)) return { error: "Zaten bir projenin ekibindesin." };
  // Kod, etkinlik kilidi ve üyelik aynı kilit altında denetlenir; yenilenen kod bekleyen katılımı da durdurur.
  const { error } = await db.rpc("join_project_by_code", {
    p_code: code, p_user: viewer.id, p_login: viewer.login, p_avatar: viewer.avatarUrl,
  });
  if (error) return { error: dbError(error.message) };
  revalidatePath(eventPath(event.slug, "panel"));
  redirect(`${eventPath(event.slug, "panel")}?katildin=1`);
}

export async function leaveProject(eventId: string) {
  const viewer = await getGithubViewer();
  if (!viewer) redirect("/");
  const event = await loadEvent(eventId);
  if (typeof event === "string") redirect("/");
  if (event.locked) redirect(eventPath(event.slug, "panel"));
  const { error } = await createAdminClient().rpc("leave_project", { p_event: event.id, p_user: viewer.id });
  if (error) console.error("[ekip] ayrılma:", error.message);
  revalidatePath(eventPath(event.slug, "panel"));
  redirect(eventPath(event.slug, "panel"));
}

/** Görüntüleyenin bu etkinlikte kurucusu olduğu proje; teslim kapalıysa yok sayılır. */
async function ownedProject(event: EventState) {
  const viewer = await getGithubViewer();
  if (!viewer) return null;
  if (event.locked) return null;
  const project = await getOwnProject(viewer.id, event.id);
  if (!project || project.members.find((m) => m.user_id === viewer.id)?.role !== "owner") return null;
  return project;
}

export async function removeMember(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return;
  const viewer = await getGithubViewer();
  const project = await ownedProject(event);
  if (!viewer || !project) return;
  // Kuruculuk, çıkarma anında DB'de yeniden denetlenir.
  const { error } = await createAdminClient().rpc("remove_member", { p_project: project.id, p_actor: viewer.id, p_target: userId });
  if (error) console.error("[ekip] üye çıkarma:", error.message);
  revalidatePath(eventPath(event.slug, "panel"));
}

export async function renewInvite(eventId: string) {
  const event = await loadEvent(eventId);
  if (typeof event === "string") return;
  const viewer = await getGithubViewer();
  const project = await ownedProject(event);
  if (!viewer || !project) return;
  // Art arda gelen yenileme istekleri, az önce paylaşılan yeni bağlantıyı da geçersiz kılmasın.
  if (!(await claimOnce(requestKey("davet", project.id), 10))) return;
  const { error } = await createAdminClient().rpc("renew_invite", {
    p_project: project.id, p_actor: viewer.id, p_code: randomBytes(9).toString("hex"),
  });
  if (error) console.error("[ekip] davet yenileme:", error.message);
  revalidatePath(eventPath(event.slug, "panel"));
}

// ---------------------------------------------------------------------------- halkın seçimi

/**
 * Oy verme ve geri alma tek eylemdir; düğmenin gösterdiği niyet formla gelir (intent=cast|withdraw).
 * Oy başka esere verilmişken eser değiştirmek, eski oyu taşır (event_id, user_id başına tek oy).
 */
export async function vote(_: FormState, formData: FormData): Promise<FormState> {
  const projectId = String(formData.get("projectId") ?? "");
  const viewer = await getGithubViewer();
  if (!viewer) return { error: "Oy vermek için GitHub ile giriş yap." };
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  if (event.voting !== "acik") return { error: "Oylama açık değil." };
  const db = createAdminClient();
  const { error } = formData.get("intent") === "withdraw"
    // Yalnızca bu esere verilmiş oy silinir; oy başka esere taşındıysa eski görünümdeki düğme onu silemez.
    ? await db.from("votes").delete().eq("event_id", event.id).eq("user_id", viewer.id).eq("project_id", projectId)
    : await db.from("votes")
      .upsert({ event_id: event.id, user_id: viewer.id, project_id: projectId, github_login: viewer.login }, { onConflict: "event_id,user_id" });
  if (error) return { error: dbError(error.message) };
  revalidateEvent(event);
  revalidatePath(`/sergi/${event.slug}`, "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------- gizem avcısı

/** Ctrl+Shift+S penceresi. Pencere dışarıdayken cevabın doğru olup olmadığı söylenmez. */
export async function huntMystery(_: FormState, formData: FormData): Promise<FormState> {
  const answer = String(formData.get("answer") ?? "");
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  if (!mysteryOpen(event)) return { error: "Gizem yalnızca hackathon saatlerinde açık." };
  if (!isMysteryAnswer(answer)) return { error: "Hmm… olmadı. 🤔" };
  const viewer = await getGithubViewer();
  if (!viewer) return { notice: "Doğru! Rozeti almak için önce GitHub ile giriş yap, sonra tekrar yaz." };
  const { error } = await createAdminClient().rpc("claim_mystery", { p_event: event.id, p_user: viewer.id, p_login: viewer.login });
  if (error) {
    if (error.message.includes("MYSTERY:")) return { error: error.message.split("MYSTERY:")[1].split("\n")[0].trim() };
    console.error("[gizem] kaydedilemedi:", error.message);
    return { error: "Bir şeyler ters gitti. Lütfen tekrar dene." };
  }
  const project = await getOwnProject(viewer.id, event.id);
  revalidatePath(eventPath(event.slug, "panel"));
  revalidatePath(eventPath(event.slug, "yonetim"));
  return {
    ok: true,
    status: project
      ? "Gizem çözüldü! Takımının panelinde gizem avcısı rozeti açıldı."
      : "Gizem çözüldü! Bir takıma katılınca rozet takımının paneline gelir.",
  };
}

// ---------------------------------------------------------------------------- yönetim

const REAUTH_MSG = "Bu işlem için son 12 saat içinde GitHub ile giriş yapmış olmalısın. Yönetim sayfasının üstündeki “GitHub ile yeniden giriş yap” düğmesini kullan.";

/**
 * Etkinlik kapsamlı yetki: işlemi yapan, bu etkinliğin topluluğunda gerekli role sahip olmalı (bkz. lib/authz).
 * Ret Türkçe mesaj (string) olarak döner ve forma yazılır; izin varsa işlemi yapan döner.
 * `fresh`: geri alınamaz ya da etkinliği doğrudan etkileyen işlemler (kilit, zamanlama, oylama, yeni etkinlik,
 * anonimleştirme) yalnızca son 12 saatte açılmış bir oturumla yapılır. Çalınmış eski bir oturum bunları yapamaz (A21).
 */
async function authorize(event: EventState, action: EventAction, fresh = false): Promise<Viewer | string> {
  let admin: Viewer;
  try {
    admin = await requireEventAction(event, action);
  } catch (e) {
    return e instanceof Error ? e.message : YETKISIZ_MESAJI;
  }
  if (fresh && !(await getAdminSession())?.fresh) return REAUTH_MSG;
  return admin;
}

/** Etkinliği yönetme (zaman, duyuru, kilit, oylama, ödül): askıdaki etkinlikte ya da başka toplulukta reddedilir. */
const requireManager = (event: EventState) => authorize(event, "yonet");
const requireFreshManager = (event: EventState) => authorize(event, "yonet", true);

/** Etkinlik değişikliği ve aktörlü denetim kaydı aynı transaction içinde yazılır. */
async function updateEvent(admin: { id: string; login: string }, eventId: string, action: string, changes: Record<string, unknown>) {
  return createAdminClient().rpc("admin_update_event", {
    p_event: eventId, p_actor: admin.id, p_login: admin.login, p_action: action, p_changes: changes,
  });
}

/** Tek tabloya bağlı olmayan yönetim işlemleri için denetim kaydı; kayıt hatası işlemi geri almaz ama görünür olur. */
async function auditAdmin(admin: { id: string; login: string }, action: string, fields: { eventId?: string; projectId?: string; after?: unknown } = {}) {
  const { error } = await createAdminClient().rpc("log_admin", {
    p_actor: admin.id, p_login: admin.login, p_action: action,
    p_event: fields.eventId ?? null, p_project: fields.projectId ?? null, p_after: fields.after ?? null,
  });
  if (error) console.error(`[denetim] ${action} kaydedilemedi:`, error.message);
}

/** datetime-local değeri Türkiye saatinde (sabit UTC+3) yorumlanır. */
function trDate(value: FormDataEntryValue | null) {
  const d = new Date(`${String(value ?? "")}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function setSchedule(_: FormState, formData: FormData): Promise<FormState> {
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  const admin = await requireFreshManager(event);
  if (typeof admin === "string") return { error: admin };
  const starts = trDate(formData.get("starts"));
  const deadline = trDate(formData.get("deadline"));
  if (!starts || !deadline) return { error: "Geçerli tarihler gir." };
  if (starts >= deadline) return { error: "Başlangıç, son teslimden önce olmalı." };
  if (deadline.getTime() <= Date.now()) return { error: "Son teslim gelecekte olmalı. Hemen kilitlemek için aşağıdaki düğmeyi kullan." };
  const once = requestKey("takvim", event.id, starts.toISOString(), deadline.toISOString());
  if (!(await claimOnce(once, 30))) return { ok: true };
  const { error } = await updateEvent(admin, event.id, "schedule", { starts_at: starts.toISOString(), deadline: deadline.toISOString() });
  if (error) {
    await releaseOnce(once);
    return { error: dbError(error.message) };
  }
  revalidateEvent(event);
  return { ok: true };
}

export async function setAnnouncement(_: FormState, formData: FormData): Promise<FormState> {
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  const admin = await requireManager(event);
  if (typeof admin === "string") return { error: admin };
  const text = String(formData.get("announcement") ?? "").trim();
  if (text.length > 160) return { error: "Duyuru en fazla 160 karakter olabilir." };
  // Aynı duyuru iki sekmeden ya da iki yöneticiden gelirse Telegram'a bir kez gider.
  const once = requestKey("duyuru", event.id, text);
  if (!(await claimOnce(once, 60))) return { ok: true };
  const { error } = await updateEvent(admin, event.id, "announcement", { announcement: text || null });
  if (error) {
    await releaseOnce(once);
    return { error: dbError(error.message) };
  }
  if (text) after(() => notifyEvent(event, [`📣 ${tg.b("Duyuru")}`, tg.text(text)], "duyuru"));
  revalidateEvent(event);
  return { ok: true };
}

/** Yemek ya da mini oyun duyurusu: maskot ve selam bitirilene kadar buna göre değişir. */
export async function setActivity(_: FormState, formData: FormData): Promise<FormState> {
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  const admin = await requireManager(event);
  if (typeof admin === "string") return { error: admin };
  const kind = String(formData.get("kind") ?? "");
  const title = String(formData.get("title") ?? "").trim().replace(/\s+/g, " ");
  if (kind !== "yemek" && kind !== "oyun" && kind !== "bitir") return { error: "Geçersiz istek." };
  if (kind !== "bitir" && (title.length < 2 || title.length > 60)) return { error: "Ad 2 ile 60 karakter arasında olmalı." };
  const once = requestKey("an", event.id, kind, kind === "bitir" ? "" : title);
  if (!(await claimOnce(once, 30))) return { ok: true };
  const { error } = await updateEvent(admin, event.id, "activity", { activity: kind === "bitir" ? null : { kind, title } });
  if (error) {
    await releaseOnce(once);
    return { error: dbError(error.message) };
  }
  if (kind !== "bitir") after(() => notifyEvent(event, [`${kind === "yemek" ? "🍽️" : "🎲"} ${tg.b(title)}`, tg.text(kind === "yemek" ? "Yemek saati başladı." : "Etkinlik başladı.")], kind === "yemek" ? "pizza" : "duyuru"));
  revalidateEvent(event);
  return { ok: true };
}

export async function lockNowAction(eventId: string): Promise<{ error?: string }> {
  const event = await loadEvent(eventId);
  if (typeof event === "string") return { error: event };
  const admin = await requireFreshManager(event);
  if (typeof admin === "string") return { error: admin };
  try {
    await lockNow(event.id, admin);
  } catch (e) {
    return { error: dbError(e instanceof Error ? e.message : "") };
  }
  after(() => freezeAll(event.id));
  revalidateEvent(event);
  return {};
}

export async function retryFreeze(formData: FormData): Promise<{ error: string } | void> {
  const id = String(formData.get("id") ?? "");
  const db = createAdminClient();
  const { data: row } = await db.from("projects").select("id, event_id").eq("id", id).maybeSingle();
  if (!row) return { error: "Eser bulunamadı." };
  // Yetki, eserin bağlı olduğu etkinlik için denetlenir; başka topluluğun eseri reddedilir.
  const owner = await getEventById(row.event_id);
  const admin = owner ? await authorize(owner, "isletim") : YETKISIZ_MESAJI;
  if (typeof admin === "string") return { error: admin };
  const event = await getEventRow(row.event_id);
  if ((event.locked_at || Date.now() >= +new Date(event.deadline)) && (await claimOnce(requestKey("muhur-yeniden", row.id), 30))) {
    await auditAdmin(admin, "retry_seal", { eventId: row.event_id, projectId: row.id });
    after(() => retrySeal(row.id, row.event_id));
  }
  revalidatePath(eventPath(owner!.slug, "yonetim"));
}

export async function setVoting(formData: FormData): Promise<{ error: string } | void> {
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  const admin = await requireFreshManager(event);
  if (typeof admin === "string") return { error: admin };
  const state = String(formData.get("state") ?? "");
  if (state !== "acik" && state !== "sonuclandi") return;
  // Durum zaten buysa ya da aynı istek az önce işlendiyse tekrar yazılmaz ve bildirim yinelenmez.
  if (event.voting === state) return;
  const once = requestKey("oylama", event.id, state);
  if (!(await claimOnce(once, 120))) return;
  // Sonuçlandırma, event satırını kilitleyen devam eden oyların bitmesini bekler; sonrasında oy yazılamaz.
  const { error } = await updateEvent(admin, event.id, "voting", { voting: state });
  if (error) await releaseOnce(once);
  else {
    after(() =>
      state === "acik"
        ? notifyEvent(event, [`🗳 ${tg.b("Halkın seçimi oylaması açıldı.")}`, tg.link(eventUrl(env.siteUrl, event.slug), "Oy ver")], "oy")
        : announcePeoplesChoice(event),
    );
  }
  revalidateEvent(event);
}

/**
 * Toplulukta yeni etkinlik: güncel etkinlik yoktur, mevcut etkinlikler etkilenmez.
 * Topluluğun hiç etkinliği yokken de çalışır; bu yüzden yetki bir etkinlikten değil, RPC'den gelir
 * (topluluk sahibi ya da organizatörü; topluluk onaylı ve askıda değil). Taze oturum burada denetlenir (A21).
 */
export async function createEvent(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await getViewer();
  if (!admin) return { error: YETKISIZ_MESAJI };
  if (!(await getAdminSession())?.fresh) return { error: REAUTH_MSG };
  const community = String(formData.get("community") ?? "");
  if (!UUID_RE.test(community)) return { error: "Topluluk seç." };
  const title = String(formData.get("title") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const starts = trDate(formData.get("starts"));
  const deadline = trDate(formData.get("deadline"));
  if (title.length < 3 || title.length > 80) return { error: "Etkinlik adı 3 ile 80 karakter arasında olmalı." };
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return { error: "Adres kısaltması yalnızca küçük harf, rakam ve tire içerebilir (örn. 2027-bahar)." };
  if (!starts || !deadline || starts >= deadline) return { error: "Başlangıç, son teslimden önce olmalı." };
  if (deadline.getTime() <= Date.now()) return { error: "Son teslim gelecekte olmalı." };
  const db = createAdminClient();
  let applicationUrl, rulesUrl, privacyUrl;
  try { applicationUrl = httpsLink(formData.get("application_url")); rulesUrl = httpsLink(formData.get("rules_url")); privacyUrl = httpsLink(formData.get("privacy_url")); }
  catch { return { error: "Etkinlik bağlantıları geçerli HTTPS adresleri olmalı." }; }
  const { data: created, error } = await db.rpc("admin_create_community_event", {
    p_community: community, p_title: title, p_slug: slug, p_starts: starts.toISOString(), p_deadline: deadline.toISOString(),
    p_actor: admin.id, p_login: admin.login, p_application_url: applicationUrl, p_rules_url: rulesUrl, p_privacy_url: privacyUrl,
  });
  if (error || !created) {
    // Eş istek (çift tıklama, ikinci sekme) ilkinden sonra slug çakışmasıyla reddedilir; aynı toplulukta aynı
    // adla zaten açılmışsa işlem tamamdır. Yetki, askı ve doğrulama hataları bu yoldan geçmez.
    if (error?.code !== "23505") return { error: dbError(error?.message ?? "") };
    const { data: existing } = await db.from("events").select("title, community_id").eq("slug", slug).maybeSingle();
    if (!(existing?.community_id === community && existing.title === title)) return { error: dbError(error.message) };
  }
  revalidatePath("/yonetim");
  revalidatePath("/");
  return { ok: true };
}

export async function addAward(_: FormState, formData: FormData): Promise<FormState> {
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  const admin = await requireManager(event);
  if (typeof admin === "string") return { error: admin };
  if (!event.locked) return { error: "Ödüller teslim kilitlendikten sonra açıklanabilir." };
  const title = String(formData.get("title") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "");
  if (title.length < 2 || title.length > 80 || reason.length < 10 || reason.length > 280) {
    return { error: "Ödül adı 2–80, gerekçe 10–280 karakter olmalı." };
  }
  const db = createAdminClient();
  const { data: p } = await db.from("projects").select("id").eq("id", projectId).eq("event_id", event.id).not("archive_sha256", "is", null).maybeSingle();
  if (!p) return { error: "Bu etkinliğin mühürlü eserlerinden birini seç." };
  const { data: awardId, error } = await db.rpc("admin_add_award", {
    p_event: event.id, p_project: p.id, p_title: title, p_reason: reason, p_actor: admin.id, p_login: admin.login,
  });
  // Ödül eklendiği an açıklanmış sayılır: vitrin ve sahne yenilenir, kanal duyurusu bir kez gider.
  if (!error && typeof awardId === "string") after(() => announceAward(event, awardId));
  if (error) {
    if (error.code !== "23505") return { error: "Ödül kaydedilemedi." };
    // Aynı ödül aynı esere aynı gerekçeyle zaten eklendiyse bu bir eş istektir.
    const { data: same } = await db.from("awards").select("id").eq("event_id", event.id).eq("title", title)
      .eq("project_id", p.id).eq("reason", reason).maybeSingle();
    if (!same) return { error: "Bu ödül adı zaten kullanılıyor." };
  }
  revalidateEvent(event);
  return { ok: true };
}

export async function removeAward(formData: FormData): Promise<{ error: string } | void> {
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  const admin = await requireManager(event);
  if (typeof admin === "string") return { error: admin };
  const { error } = await createAdminClient().rpc("admin_remove_award", {
    p_award: String(formData.get("id") ?? ""), p_event: event.id, p_actor: admin.id, p_login: admin.login,
  });
  if (error) throw new Error("Ödül kaldırılamadı.");
  revalidateEvent(event);
}

/** İşçi bütün etkinlikleri işler; tetikleme yetkisi, yönetim sayfası açık olan etkinlik için denetlenir. */
export async function runWorker(eventId: string): Promise<{ error: string } | void> {
  const event = await loadEvent(eventId);
  if (typeof event === "string") return { error: event };
  const admin = await authorize(event, "isletim");
  if (typeof admin === "string") return { error: admin };
  if (!(await claimOnce(requestKey("calistir"), 30))) return revalidatePath(eventPath(event.slug, "yonetim"));
  await auditAdmin(admin, "run_worker", { eventId: event.id });
  after(async () => { await tick(); });
  revalidatePath(eventPath(event.slug, "yonetim"));
}

export async function retryDeliveryJob(previous: FormState, formData: FormData): Promise<FormState> {
  void previous;
  const id = String(formData.get("jobId") ?? "");
  const db = createAdminClient();
  const { data: job } = await db.from("delivery_jobs").select("project_id, event_id").eq("id", id).maybeSingle();
  if (!job) return { error: "Teslim işi bulunamadı." };
  // Yetki, işin bağlı olduğu etkinlik için denetlenir.
  const owner = await getEventById(job.event_id);
  const admin = owner ? await authorize(owner, "isletim") : YETKISIZ_MESAJI;
  if (typeof admin === "string") return { error: admin };
  const { data, error } = await db.rpc("retry_delivery_job", { p_job: id });
  if (error) return { error: dbError(error.message) };
  if (data !== true) {
    // Eş istek: ilk istek işi zaten sıraya aldıysa başarı sayılır.
    const { data: now } = await db.from("delivery_jobs").select("state").eq("id", id).maybeSingle();
    if (now?.state === "queued" || now?.state === "processing") return { ok: true };
    return { error: "İş yeniden denemeye uygun değil." };
  }
  await auditAdmin(admin, "retry_job", { projectId: job.project_id, after: { job: id } });
  after(() => processProjectJobs(job.project_id));
  revalidatePath(eventPath(owner!.slug, "yonetim"));
  revalidatePath("/yonetim");
  return { ok: true };
}

/**
 * KVKK silme başvurusu: kişinin ekip/oy kayıtlarındaki GitHub adı ve avatarı kaldırılır, hesabı kapatılır.
 * Eser kaydı, teslim SHA'sı, arşiv hash'i ve zamanlar korunur. Arayüzü yönetim sayfasına ayrıca eklenecek.
 */
export async function anonymizeUser(_: FormState, formData: FormData): Promise<FormState> {
  // Anonimleştirme platform işidir: etkinliğe bağlı değildir, yalnızca head admin yapar (DB de denetler).
  const admin = await getViewer();
  if (!admin?.isHeadAdmin) return { error: YETKISIZ_MESAJI };
  if (!(await getAdminSession())?.fresh) return { error: REAUTH_MSG };
  const login = String(formData.get("login") ?? "").trim().replace(/^@/, "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) return { error: "Geçerli bir GitHub kullanıcı adı yaz." };
  if (reason.length < 5) return { error: "Başvuru gerekçesini yaz (en az 5 karakter)." };
  const db = createAdminClient();
  const [members, votes, hunters, mascotProposals, mascotVotes] = await Promise.all([
    db.from("project_members").select("user_id").ilike("github_login", login),
    db.from("votes").select("user_id").ilike("github_login", login),
    db.from("mystery_hunters").select("user_id").ilike("github_login", login),
    db.from("mascot_name_proposals").select("author_id").ilike("author_login", login),
    db.from("mascot_name_votes").select("voter_id").ilike("voter_login", login),
  ]);
  if (members.error || votes.error || hunters.error || mascotProposals.error || mascotVotes.error) return { error: "Kayıtlar okunamadı. Tekrar dene." };
  const ids = [...new Set([
    ...[...(members.data ?? []), ...(votes.data ?? []), ...(hunters.data ?? [])].map(r => r.user_id),
    ...(mascotProposals.data ?? []).map(r => r.author_id),
    ...(mascotVotes.data ?? []).map(r => r.voter_id),
  ])];
  if (ids.length === 0) return { error: "Bu kullanıcı adına bağlı kayıt bulunamadı." };
  if (ids.length > 1) return { error: "Bu ad birden çok hesapla eşleşti; işlem durduruldu. Teknik destekle ilerle." };
  if (ids[0] === admin.id) return { error: "Kendi hesabını buradan anonimleştiremezsin." };
  const { error } = await db.rpc("anonymize_user", { p_user: ids[0], p_actor: admin.id, p_login: admin.login, p_reason: reason });
  if (error) return { error: dbError(error.message) };
  // Yumuşak silme: auth kaydı yabancı anahtarlar için kalır; e-posta, kimlikler ve profil bilgisi kaldırılır, giriş kapanır.
  const { error: authError } = await db.auth.admin.deleteUser(ids[0], true);
  if (authError) return { error: "Kayıtlar anonimleştirildi ancak hesap kapatılamadı. Supabase panelinden kontrol et." };
  // Ad her etkinlikte görünebilir: bütün sayfalar tazelenir.
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------- platform askısı

/**
 * Etkinliği askıya alma / askıyı kaldırma: yalnızca head admin, taze oturumla (A21), 3–500 karakter gerekçeyle.
 * Etkinlik formdan (gizli `event` alanı) gelir; ekranda görülen etkinliğe uygulanır.
 * DB yetkiyi, gerekçeyi ve durumu yeniden denetler; işlem aynı transaction'da denetim kaydına yazılır.
 */
async function platformSuspension(formData: FormData, rpc: "suspend_event" | "unsuspend_event"): Promise<FormState> {
  const event = await loadEvent(formData.get("event"));
  if (typeof event === "string") return { error: event };
  const admin = await authorize(event, "askiya-al", true);
  if (typeof admin === "string") return { error: admin };
  const reason = String(formData.get("gerekce") ?? "").trim();
  if (reason.length < 3 || reason.length > 500) return { error: "Gerekçe 3 ile 500 karakter arasında olmalı." };
  const { error } = await createAdminClient().rpc(rpc, { p_event: event.id, p_actor: admin.id, p_login: admin.login, p_reason: reason });
  if (error) {
    // Eş istek (iki sekme, çift tıklama) ilkinden sonra bu iki mesajla reddedilir; durum ekranda görünür.
    for (const known of ["Etkinlik zaten askıda.", "Etkinlik askıda değil."]) if (error.message.includes(known)) return { error: known };
    return { error: dbError(error.message) };
  }
  revalidateEvent(event);
  return { ok: true };
}

export async function suspendEvent(_: FormState, formData: FormData): Promise<FormState> {
  return platformSuspension(formData, "suspend_event");
}

export async function unsuspendEvent(_: FormState, formData: FormData): Promise<FormState> {
  return platformSuspension(formData, "unsuspend_event");
}
