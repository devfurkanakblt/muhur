"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { getAdminSession, getGithubViewer, getViewer } from "@/lib/data";
import { communityFields, communityError, UUID } from "@/lib/community-input";
import { getRoleInvite } from "@/lib/community";
import { newInviteToken, inviteHash } from "@/lib/role-invites";
import { encryptMailSecret } from "@/lib/mail/secrets";
import { githubIdentity } from "@/lib/identity";
import { env } from "@/lib/env";
export type CommunityActionState = { ok?: boolean; error?: string; link?: string; notice?: string } | undefined;
const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const FRESH = "Bu işlem için GitHub ile yeniden giriş yap; oturumun son 12 saat içinde açılmış olmalı.";
async function manager() { const viewer = await getGithubViewer(); return viewer && (await getAdminSession())?.fresh ? viewer : null; }
function refresh() { revalidatePath("/topluluk", "layout"); revalidatePath("/yonetim", "layout"); revalidatePath("/"); }
export async function submitApplication(_previous: CommunityActionState, form: FormData): Promise<CommunityActionState> {
  if (!env.communityApplicationsEnabled) return { error: "Topluluk başvuruları henüz açılmadı." };
  const viewer = await getGithubViewer(); if (!viewer) return { error: "Başvuru için GitHub ile giriş yap." };
  let fields; try { fields = communityFields(form); } catch (e) { return { error: e instanceof Error ? e.message : "Bilgileri kontrol et." }; }
  if (form.get("accept_platform") !== "on" || form.get("accept_data_processing") !== "on") return { error: "İki belgeyi de ayrı ayrı onaylamalısın." };
  const requestId = text(form, "request_id"), platform = text(form, "platform_document"), dpa = text(form, "data_processing_document");
  if (![requestId, platform, dpa].every(id => UUID.test(id))) return { error: "Belge veya istek bilgisi değişmiş. Sayfayı yenile." };
  const result = await createAdminClient().rpc("submit_community_application", { p_actor: viewer.id, p_login: viewer.login, p_request: requestId, p_fields: fields, p_document_ids: [platform, dpa] });
  if (result.error) return { error: communityError(result.error) }; refresh(); redirect("/topluluk/basvurularim");
}
export async function reviewApplication(_previous: CommunityActionState, form: FormData): Promise<CommunityActionState> {
  const viewer = await manager(); if (!viewer) return { error: FRESH }; if (!viewer.isHeadAdmin) return { error: "Yetkisiz" };
  const id = text(form, "community"); if (!UUID.test(id)) return { error: "Geçersiz başvuru." };
  const result = await createAdminClient().rpc("review_community_application", { p_community: id, p_actor: viewer.id, p_login: viewer.login, p_decision: text(form, "decision"), p_reason: text(form, "reason") || null });
  if (result.error) return { error: communityError(result.error) }; refresh(); return { ok: true };
}
export async function createRoleInvite(_previous: CommunityActionState, form: FormData): Promise<CommunityActionState> {
  const viewer = await manager(); if (!viewer) return { error: FRESH };
  const kind = text(form, "kind"), scope = text(form, "scope"), email = text(form, "email").toLowerCase(), requestId = text(form, "request_id");
  if (!["juri", "organizator"].includes(kind) || !UUID.test(scope) || !UUID.test(requestId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: "Davet bilgilerini kontrol et." };
  const token = newInviteToken(), hash = inviteHash(token)!; let ciphertext;
  try { ciphertext = encryptMailSecret({ token }); } catch { return { error: "E-posta bağlantısı ayarlanmadı. Platform yöneticisine haber ver." }; }
  const db = createAdminClient(); const result = await db.rpc("create_role_invite", { p_actor: viewer.id, p_login: viewer.login, p_kind: kind, p_scope: scope, p_token_hash: hash, p_email: email, p_mail_ciphertext: ciphertext, p_request: requestId });
  if (result.error) return { error: communityError(result.error) };
  const existing = await db.from("role_invites").select("token_hash").eq("id", result.data).maybeSingle();
  if (existing.error || !existing.data) return { error: "Davet oluşturuldu ancak bağlantı okunamadı; e-posta durumunu kontrol et." };
  refresh(); return existing.data.token_hash === hash ? { ok: true, link: new URL(`/katil/${token}`, env.siteUrl).href } : { ok: true, notice: "Bu davet zaten oluşturuldu. E-posta durumunu kontrol et; yeni bağlantı için bekleme süresinden sonra tekrar davet et." };
}
export async function acceptRoleInvite(_previous: CommunityActionState, form: FormData): Promise<CommunityActionState> {
  const viewer = await getViewer(); if (!viewer) return { error: "Daveti kabul etmek için giriş yap." };
  const token = text(form, "token"), hash = inviteHash(token); if (!hash) return { error: "Davet geçersiz veya süresi dolmuş." };
  const invitation = await getRoleInvite(token); if (!invitation) return { error: "Davet geçersiz veya kullanılmış." };
  const result = await createAdminClient().rpc("accept_role_invite", { p_actor: viewer.id, p_login: viewer.login, p_provider: viewer.provider, p_token_hash: hash });
  if (result.error) return { error: communityError(result.error) };
  refresh(); redirect(invitation.kind === "juri" ? `/e/${invitation.slug}/juri` : `/topluluk/${invitation.slug}`);
}
export async function changeCommunityRole(_previous: CommunityActionState, form: FormData): Promise<CommunityActionState> {
  const viewer = await manager(); if (!viewer) return { error: FRESH };
  const scope = text(form, "scope"), operation = text(form, "operation"), target = text(form, "target");
  if (!UUID.test(scope)) return { error: "Geçersiz kapsam." };
  const db = createAdminClient(); let result;
  const base = { p_actor: viewer.id, p_login: viewer.login };
  if (operation === "revoke") result = await db.rpc("revoke_role_invite", { ...base, p_invite: scope });
  else if (operation === "suspend" || operation === "unsuspend") {
    if (!viewer.isHeadAdmin) return { error: "Yetkisiz" };
    result = await db.rpc(operation === "suspend" ? "suspend_community" : "unsuspend_community", { ...base, p_community: scope, p_reason: text(form, "reason") });
  } else {
    if (!UUID.test(target)) return { error: "Bir üye seç." };
    if (operation === "recover") {
      if (!viewer.isHeadAdmin) return { error: "Yetkisiz" };
      const user = await db.auth.admin.getUserById(target); const github = user.data.user ? githubIdentity(user.data.user) : null;
      if (user.error || !github) return { error: "Bu kullanıcıda doğrulanmış GitHub kimliği yok." };
      result = await db.rpc("set_community_owner", { p_community: scope, p_user: target, p_login: github.login, p_actor: viewer.id, p_actor_login: viewer.login, p_reason: text(form, "reason") });
    } else if (operation === "remove") result = await db.rpc("remove_community_organizer", { ...base, p_community: scope, p_target: target });
    else if (operation === "remove-juror") result = await db.rpc("remove_event_juror", { ...base, p_event: scope, p_target: target });
    else if (operation === "transfer") {
      if (form.get("confirm") !== "on") return { error: "Sahiplik devrini onayla." };
      result = await db.rpc("transfer_community_ownership", { ...base, p_community: scope, p_target: target });
    } else return { error: "Geçersiz işlem." };
  }
  if (result.error) return { error: communityError(result.error) }; refresh(); return { ok: true };
}
export async function retryCommunityMail(_previous: CommunityActionState, form: FormData): Promise<CommunityActionState> {
  const viewer = await manager(); if (!viewer) return { error: FRESH }; const id = text(form, "job"); if (!UUID.test(id)) return { error: "Geçersiz e-posta işi." };
  const result = await createAdminClient().rpc("retry_mail_job", { p_actor: viewer.id, p_login: viewer.login, p_job: id, p_confirm_uncertain: form.get("confirm") === "on" });
  if (result.error) return { error: communityError(result.error) }; refresh(); return { ok: true };
}
