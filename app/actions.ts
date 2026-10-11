"use server";

import { createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { exhibitPath, getAdminSession, getEvent, getOwnProject, getViewer } from "@/lib/data";
import { canClaimRepo, getHeadSha, getRepo, getRepoById, GithubError, parseRepoInput } from "@/lib/github";
import { checkHealth, freezeAll, getEventRow, lockNow, tick } from "@/lib/freeze";
import { processProjectJobs, retrySeal } from "@/lib/delivery";
import { safeDemoUrl } from "@/lib/delivery-policy";
import { normalizeLogo, type NormalizedLogo } from "@/lib/logo-image";
import { notify, tg } from "@/lib/notify";
import { env } from "@/lib/env";
import { claimOnce, releaseOnce, requestKey } from "@/lib/once";
import { isMysteryAnswer, mysteryOpen } from "@/lib/mystery";

/** notice: hata olmayan bilgi (ör. "bu commit zaten kabul edilmiş"); nötr gösterilir. */
export type FormState = { error?: string; ok?: boolean; status?: string; notice?: string } | undefined;

const LOCKED_MSG = "Teslim süresi doldu. Sistem kilitli, değişiklik kabul edilmiyor.";

function dbError(message: string) {
  if (message.includes("VOTING:")) return message.split("VOTING:")[1].split("\n")[0].trim();
  if (message.includes("LOCKED")) return LOCKED_MSG;
  if (message.includes("MEMBER:")) return "Zaten bir projenin ekibindesin.";
  if (message.includes("TEAM:")) return message.split("TEAM:")[1].split("\n")[0].trim();
  if (message.includes("projects_event_id_repo_id_key")) return "Bu repo zaten başka bir ekip tarafından içe aktarılmış.";
  if (message.includes("project_members_event_id_user_id_key")) return "Zaten bir projenin ekibindesin.";
  if (message.includes("events_slug_key")) return "Bu adres kısaltması başka bir etkinlikte kullanılıyor.";
  return "Bir şeyler ters gitti. Lütfen tekrar dene.";
}

// ---------------------------------------------------------------------------- auth

export async function signIn(formData: FormData) {
  const next = String(formData.get("next") ?? "/panel");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: "read:user read:org",
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
  const viewer = await getViewer();
  if (!viewer) return { error: "Önce GitHub ile giriş yap." };
  const event = await getEvent();
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
    await notify([
      `🖼 ${tg.b("Vitrine yeni eser")} · No. ${String(project.exhibit_no).padStart(3, "0")}`,
      `${tg.b(fields.name)} · ${tg.text(fields.team)}`,
      tg.link(`${env.siteUrl}${exhibitPath(event.slug, project.exhibit_no)}`, repo.full_name),
    ], "vitrinde");
  });

  revalidatePath("/");
  redirect("/panel?kayit=tamam");
}

export async function updateProject(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Önce GitHub ile giriş yap." };
  const event = await getEvent();
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

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function withdrawProject(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  const event = await getEvent();
  if (event.locked) redirect("/panel");
  const project = await getOwnProject(viewer.id, event.id);
  if (!project || project.members.find((m) => m.user_id === viewer.id)?.role !== "owner") redirect("/panel");
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
  revalidatePath("/");
  redirect("/panel");
}

/** Panelden "Yeniden kontrol et": eserin repo sağlığını hemen yeniler. */
export async function recheckHealth() {
  const viewer = await getViewer();
  if (!viewer) return;
  const event = await getEvent();
  const project = await getOwnProject(viewer.id, event.id);
  if (!project) return;
  // Ekipteki herkes aynı anda bassa da GitHub'a 30 sn'de bir kez gidilir.
  if (await claimOnce(requestKey("saglik", project.id), 30)) await checkHealth(project, await getEventRow(event.id));
  revalidatePath("/panel");
}

export async function submitVersion(previous: FormState): Promise<FormState> {
  void previous;
  const viewer = await getViewer();
  if (!viewer) return { error: "Önce GitHub ile giriş yap." };
  const event = await getEvent();
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
    revalidatePath("/panel");
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
  const viewer = await getViewer();
  const project = await ownedProject();
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
  revalidatePath("/panel");
  return { ok: true };
}

// ---------------------------------------------------------------------------- ekip

export async function joinProject(_: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const viewer = await getViewer();
  if (!viewer) return { error: "Önce GitHub ile giriş yap." };
  const event = await getEvent();
  if (event.locked) return { error: LOCKED_MSG };
  if (await getOwnProject(viewer.id, event.id)) return { error: "Zaten bir projenin ekibindesin." };
  // Kod, güncel etkinlik ve üyelik aynı kilit altında denetlenir; yenilenen kod bekleyen katılımı da durdurur.
  const { error } = await createAdminClient().rpc("join_project_by_code", {
    p_code: code, p_user: viewer.id, p_login: viewer.login, p_avatar: viewer.avatarUrl,
  });
  if (error) return { error: dbError(error.message) };
  revalidatePath("/panel");
  redirect("/panel?katildin=1");
}

export async function leaveProject() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  const event = await getEvent();
  if (event.locked) redirect("/panel");
  const { error } = await createAdminClient().rpc("leave_project", { p_event: event.id, p_user: viewer.id });
  if (error) console.error("[ekip] ayrılma:", error.message);
  revalidatePath("/panel");
  redirect("/panel");
}

async function ownedProject() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const event = await getEvent();
  if (event.locked) return null;
  const project = await getOwnProject(viewer.id, event.id);
  if (!project || project.members.find((m) => m.user_id === viewer.id)?.role !== "owner") return null;
  return project;
}

export async function removeMember(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const viewer = await getViewer();
  const project = await ownedProject();
  if (!viewer || !project) return;
  // Kuruculuk, çıkarma anında DB'de yeniden denetlenir.
  const { error } = await createAdminClient().rpc("remove_member", { p_project: project.id, p_actor: viewer.id, p_target: userId });
  if (error) console.error("[ekip] üye çıkarma:", error.message);
  revalidatePath("/panel");
}

export async function renewInvite() {
  const viewer = await getViewer();
  const project = await ownedProject();
  if (!viewer || !project) return;
  // Art arda gelen yenileme istekleri, az önce paylaşılan yeni bağlantıyı da geçersiz kılmasın.
  if (!(await claimOnce(requestKey("davet", project.id), 10))) return;
  const { error } = await createAdminClient().rpc("renew_invite", {
    p_project: project.id, p_actor: viewer.id, p_code: randomBytes(9).toString("hex"),
  });
  if (error) console.error("[ekip] davet yenileme:", error.message);
  revalidatePath("/panel");
}

// ---------------------------------------------------------------------------- halkın seçimi

export async function castVote(_: FormState, formData: FormData): Promise<FormState> {
  const projectId = String(formData.get("projectId") ?? "");
  const viewer = await getViewer();
  if (!viewer) return { error: "Oy vermek için GitHub ile giriş yap." };
  const event = await getEvent();
  if (event.voting !== "acik") return { error: "Oylama açık değil." };
  const db = createAdminClient();
  const { error } = await db
    .from("votes")
    .upsert({ event_id: event.id, user_id: viewer.id, project_id: projectId, github_login: viewer.login }, { onConflict: "event_id,user_id" });
  if (error) return { error: dbError(error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function withdrawVote(): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Önce GitHub ile giriş yap." };
  const event = await getEvent();
  const db = createAdminClient();
  const { error } = await db.from("votes").delete().eq("event_id", event.id).eq("user_id", viewer.id);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------- gizem avcısı

/** Ctrl+Shift+S penceresi. Pencere dışarıdayken cevabın doğru olup olmadığı söylenmez. */
export async function huntMystery(_: FormState, formData: FormData): Promise<FormState> {
  const answer = String(formData.get("answer") ?? "");
  const event = await getEvent();
  if (!mysteryOpen(event)) return { error: "Gizem yalnızca hackathon saatlerinde açık." };
  if (!isMysteryAnswer(answer)) return { error: "Hmm… olmadı. 🤔" };
  const viewer = await getViewer();
  if (!viewer) return { notice: "Doğru! Rozeti almak için önce GitHub ile giriş yap, sonra tekrar yaz." };
  const { error } = await createAdminClient().rpc("claim_mystery", { p_event: event.id, p_user: viewer.id, p_login: viewer.login });
  if (error) {
    if (error.message.includes("MYSTERY:")) return { error: error.message.split("MYSTERY:")[1].split("\n")[0].trim() };
    console.error("[gizem] kaydedilemedi:", error.message);
    return { error: "Bir şeyler ters gitti. Lütfen tekrar dene." };
  }
  const project = await getOwnProject(viewer.id, event.id);
  revalidatePath("/panel");
  revalidatePath("/yonetim");
  return {
    ok: true,
    status: project
      ? "Gizem çözüldü! Takımının panelinde gizem avcısı rozeti açıldı."
      : "Gizem çözüldü! Bir takıma katılınca rozet takımının paneline gelir.",
  };
}

// ---------------------------------------------------------------------------- yönetim

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Yetkisiz");
  return viewer;
}

const REAUTH_MSG = "Bu işlem için son 12 saat içinde GitHub ile giriş yapmış olmalısın. Yönetim sayfasının üstündeki “GitHub ile yeniden giriş yap” düğmesini kullan.";

/**
 * Geri alınamaz ya da etkinliği doğrudan etkileyen yönetim işlemleri (kilit, zamanlama, oylama, yeni etkinlik,
 * anonimleştirme) yalnızca son 12 saatte açılmış bir oturumla yapılır. Çalınmış eski bir oturum bunları yapamaz (A21).
 */
async function requireFreshAdmin(): Promise<{ admin: Awaited<ReturnType<typeof requireAdmin>>; error?: string }> {
  const admin = await requireAdmin();
  const session = await getAdminSession();
  return session?.fresh ? { admin } : { admin, error: REAUTH_MSG };
}

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
  const { admin, error: reauth } = await requireFreshAdmin();
  if (reauth) return { error: reauth };
  const starts = trDate(formData.get("starts"));
  const deadline = trDate(formData.get("deadline"));
  if (!starts || !deadline) return { error: "Geçerli tarihler gir." };
  if (starts >= deadline) return { error: "Başlangıç, son teslimden önce olmalı." };
  if (deadline.getTime() <= Date.now()) return { error: "Son teslim gelecekte olmalı. Hemen kilitlemek için aşağıdaki düğmeyi kullan." };
  const event = await getEvent();
  const once = requestKey("takvim", event.id, starts.toISOString(), deadline.toISOString());
  if (!(await claimOnce(once, 30))) return { ok: true };
  const { error } = await updateEvent(admin, event.id, "schedule", { starts_at: starts.toISOString(), deadline: deadline.toISOString() });
  if (error) {
    await releaseOnce(once);
    return { error: dbError(error.message) };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setAnnouncement(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const text = String(formData.get("announcement") ?? "").trim();
  if (text.length > 160) return { error: "Duyuru en fazla 160 karakter olabilir." };
  const event = await getEvent();
  // Aynı duyuru iki sekmeden ya da iki yöneticiden gelirse Telegram'a bir kez gider.
  const once = requestKey("duyuru", event.id, text);
  if (!(await claimOnce(once, 60))) return { ok: true };
  const { error } = await updateEvent(admin, event.id, "announcement", { announcement: text || null });
  if (error) {
    await releaseOnce(once);
    return { error: dbError(error.message) };
  }
  if (text) after(() => notify([`📣 ${tg.b("Duyuru")}`, tg.text(text)], "duyuru"));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function lockNowAction(): Promise<{ error?: string }> {
  const { admin, error } = await requireFreshAdmin();
  if (error) return { error };
  const event = await getEvent();
  await lockNow(event.id, admin);
  after(() => freezeAll(event.id));
  revalidatePath("/", "layout");
  return {};
}

export async function retryFreeze(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const db = createAdminClient();
  const { data: row } = await db.from("projects").select("id, event_id").eq("id", id).maybeSingle();
  if (row) {
    const event = await getEventRow(row.event_id);
    if ((event.locked_at || Date.now() >= +new Date(event.deadline)) && (await claimOnce(requestKey("muhur-yeniden", row.id), 30))) {
      await auditAdmin(admin, "retry_seal", { eventId: row.event_id, projectId: row.id });
      after(() => retrySeal(row.id, row.event_id));
    }
  }
  revalidatePath("/yonetim");
}

export async function setVoting(formData: FormData): Promise<{ error: string } | void> {
  const { admin, error: reauth } = await requireFreshAdmin();
  if (reauth) return { error: reauth };
  const state = String(formData.get("state") ?? "");
  if (state !== "acik" && state !== "sonuclandi") return;
  const event = await getEvent();
  // Durum zaten buysa ya da aynı istek az önce işlendiyse tekrar yazılmaz ve bildirim yinelenmez.
  if (event.voting === state) return;
  const once = requestKey("oylama", event.id, state);
  if (!(await claimOnce(once, 120))) return;
  // Sonuçlandırma, event satırını kilitleyen devam eden oyların bitmesini bekler; sonrasında oy yazılamaz.
  const { error } = await updateEvent(admin, event.id, "voting", { voting: state });
  if (error) await releaseOnce(once);
  else {
    after(() =>
      notify(
        state === "acik"
          ? [`🗳 ${tg.b("Halkın seçimi oylaması açıldı.")}`, tg.link(env.siteUrl, "Oy ver")]
          : [`🏆 ${tg.b("Halkın seçimi sonuçlandı.")}`, tg.link(env.siteUrl, "Sonuçlara bak")],
        state === "acik" ? "oy" : "kazanan",
      ),
    );
  }
  revalidatePath("/", "layout");
}

export async function createEvent(_: FormState, formData: FormData): Promise<FormState> {
  const { admin, error: reauth } = await requireFreshAdmin();
  if (reauth) return { error: reauth };
  const current = await getEvent();
  if (!current.locked) return { error: "Yeni etkinlik, güncel etkinlik mühürlendikten sonra açılabilir." };
  const title = String(formData.get("title") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const starts = trDate(formData.get("starts"));
  const deadline = trDate(formData.get("deadline"));
  if (title.length < 3 || title.length > 80) return { error: "Etkinlik adı 3 ile 80 karakter arasında olmalı." };
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return { error: "Adres kısaltması yalnızca küçük harf, rakam ve tire içerebilir (örn. 2027-bahar)." };
  if (!starts || !deadline || starts >= deadline) return { error: "Başlangıç, son teslimden önce olmalı." };
  if (deadline.getTime() <= Date.now()) return { error: "Son teslim gelecekte olmalı." };
  const db = createAdminClient();
  const { data: created, error } = await db.rpc("admin_switch_event", {
    p_current: current.id, p_title: title, p_slug: slug, p_starts: starts.toISOString(), p_deadline: deadline.toISOString(),
    p_actor: admin.id, p_login: admin.login,
  });
  if (error || !created) {
    // Eş istek ilkinin ardından reddedilir; aynı etkinlik zaten güncelse işlem tamamdır.
    const { data: existing } = await db.from("events").select("title, is_current").eq("slug", slug).maybeSingle();
    if (!(existing?.is_current && existing.title === title)) return { error: dbError(error?.message ?? "") };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addAward(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const event = await getEvent();
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
  const { error } = await db.rpc("admin_add_award", {
    p_event: event.id, p_project: p.id, p_title: title, p_reason: reason, p_actor: admin.id, p_login: admin.login,
  });
  if (error) {
    if (error.code !== "23505") return { error: "Ödül kaydedilemedi." };
    // Aynı ödül aynı esere aynı gerekçeyle zaten eklendiyse bu bir eş istektir.
    const { data: same } = await db.from("awards").select("id").eq("event_id", event.id).eq("title", title)
      .eq("project_id", p.id).eq("reason", reason).maybeSingle();
    if (!same) return { error: "Bu ödül adı zaten kullanılıyor." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeAward(formData: FormData) {
  const admin = await requireAdmin();
  const event = await getEvent();
  const { error } = await createAdminClient().rpc("admin_remove_award", {
    p_award: String(formData.get("id") ?? ""), p_event: event.id, p_actor: admin.id, p_login: admin.login,
  });
  if (error) throw new Error("Ödül kaldırılamadı.");
  revalidatePath("/", "layout");
}

export async function runWorker() {
  const admin = await requireAdmin();
  if (!(await claimOnce(requestKey("calistir"), 30))) return revalidatePath("/yonetim");
  await auditAdmin(admin, "run_worker");
  after(async () => { await tick(); });
  revalidatePath("/yonetim");
}

export async function retryDeliveryJob(previous: FormState, formData: FormData): Promise<FormState> {
  void previous;
  const admin = await requireAdmin();
  const id = String(formData.get("jobId") ?? "");
  const db = createAdminClient();
  const { data: job } = await db.from("delivery_jobs").select("project_id").eq("id", id).maybeSingle();
  if (!job) return { error: "Teslim işi bulunamadı." };
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
  revalidatePath("/yonetim");
  return { ok: true };
}

/**
 * KVKK silme başvurusu: kişinin ekip/oy kayıtlarındaki GitHub adı ve avatarı kaldırılır, hesabı kapatılır.
 * Eser kaydı, teslim SHA'sı, arşiv hash'i ve zamanlar korunur. Arayüzü yönetim sayfasına ayrıca eklenecek.
 */
export async function anonymizeUser(_: FormState, formData: FormData): Promise<FormState> {
  const { admin, error: reauth } = await requireFreshAdmin();
  if (reauth) return { error: reauth };
  const login = String(formData.get("login") ?? "").trim().replace(/^@/, "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) return { error: "Geçerli bir GitHub kullanıcı adı yaz." };
  if (reason.length < 5) return { error: "Başvuru gerekçesini yaz (en az 5 karakter)." };
  const db = createAdminClient();
  const [members, votes] = await Promise.all([
    db.from("project_members").select("user_id").ilike("github_login", login),
    db.from("votes").select("user_id").ilike("github_login", login),
  ]);
  if (members.error || votes.error) return { error: "Kayıtlar okunamadı. Tekrar dene." };
  const ids = [...new Set([...(members.data ?? []), ...(votes.data ?? [])].map((r) => r.user_id))];
  if (ids.length === 0) return { error: "Bu kullanıcı adına bağlı kayıt bulunamadı." };
  if (ids.length > 1) return { error: "Bu ad birden çok hesapla eşleşti; işlem durduruldu. Teknik destekle ilerle." };
  if (ids[0] === admin.id) return { error: "Kendi hesabını buradan anonimleştiremezsin." };
  const { error } = await db.rpc("anonymize_user", { p_user: ids[0], p_actor: admin.id, p_login: admin.login, p_reason: reason });
  if (error) return { error: dbError(error.message) };
  // Yumuşak silme: auth kaydı yabancı anahtarlar için kalır; e-posta, kimlikler ve profil bilgisi kaldırılır, giriş kapanır.
  const { error: authError } = await db.auth.admin.deleteUser(ids[0], true);
  if (authError) return { error: "Kayıtlar anonimleştirildi ancak hesap kapatılamadı. Supabase panelinden kontrol et." };
  revalidatePath("/", "layout");
  return { ok: true };
}
