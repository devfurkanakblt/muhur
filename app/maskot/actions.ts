"use server";

import { revalidatePath } from "next/cache";
import { getEvent, getViewer, type EventState, type Viewer } from "@/lib/data";
import { getEventAccess } from "@/lib/access";
import { ASKIDA_MESAJI, can, denialMessage } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/server";
import type { NamingPhase } from "@/lib/mascot-naming";

export type NamingActionState = { ok?: boolean; error?: string } | undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^[\p{L}\p{N}]+(?:[ '\-][\p{L}\p{N}]+)*$/u;

function message(error: { message: string }): string {
  const raw = error.message;
  if (raw.includes("MASCOT:")) return raw.split("MASCOT:")[1].split("\n")[0].trim();
  if (raw.includes("ASKIDA:")) return ASKIDA_MESAJI;
  if (raw.includes("mascot_name_proposals_unique_name")) return "Bu isim zaten önerilmiş.";
  if (raw.includes("mascot_name_proposals_event_id_author_id_key")) return "Bu etkinlikte bir öneri hakkını kullandın.";
  if (raw.includes("mascot_name_votes_pkey")) return "Bu etkinlikte oyunu kullandın.";
  console.error("[maskot]", raw);
  return "İşlem tamamlanamadı. Biraz sonra tekrar dene.";
}

/** Aşama ve görünürlük doğrudan tabloya yazılır; RPC denetimi olmadığından yetki burada etkinlik kapsamında denetlenir. */
async function manageError(viewer: Viewer | null, event: EventState): Promise<string | null> {
  const access = await getEventAccess(viewer, event);
  if (can(access, "yonet")) return null;
  return denialMessage(access, "yonet") === ASKIDA_MESAJI ? ASKIDA_MESAJI : "Bu işlem yalnızca organizatöre açık.";
}

const NAME_RULE = "2–24 karakterlik bir isim yaz. Harf, rakam, boşluk, tire ve kesme işareti kullanabilirsin.";

function readName(form: FormData): string | null {
  const name = String(form.get("name") ?? "").trim().replace(/\s+/gu, " ");
  const length = Array.from(name).length;
  return length >= 2 && length <= 24 && NAME.test(name) ? name : null;
}

export async function suggestMascotName(_previous: NamingActionState, form: FormData): Promise<NamingActionState> {
  const [viewer, event] = await Promise.all([getViewer(), getEvent()]);
  if (!viewer) return { error: "Öneri için GitHub ile giriş yap." };
  const name = readName(form);
  if (!name) return { error: NAME_RULE };
  const db = createAdminClient();
  const { data: member, error: memberError } = await db.from("project_members")
    .select("user_id").eq("event_id", event.id).eq("user_id", viewer.id).maybeSingle();
  if (memberError) return { error: "Katılımcı kaydın kontrol edilemedi." };
  if (!member) return { error: "İsim önermek için bu hackathonda yarışmacı olmalısın." };
  const { error } = await db.from("mascot_name_proposals").insert({
    event_id: event.id, author_id: viewer.id, author_login: viewer.login, name,
  });
  if (error) return { error: message(error) };
  revalidatePath("/maskot");
  return { ok: true };
}

export async function editMascotName(_previous: NamingActionState, form: FormData): Promise<NamingActionState> {
  const [viewer, event] = await Promise.all([getViewer(), getEvent()]);
  if (!viewer) return { error: "Düzenlemek için GitHub ile giriş yap." };
  const name = readName(form);
  if (!name) return { error: NAME_RULE };
  const { data, error } = await createAdminClient().from("mascot_name_proposals")
    .update({ name }).eq("event_id", event.id).eq("author_id", viewer.id).select("id").maybeSingle();
  if (error) return { error: message(error) };
  if (!data) return { error: "Düzenlenecek önerin bulunamadı." };
  revalidatePath("/maskot");
  return { ok: true };
}

export async function voteMascotName(_previous: NamingActionState, form: FormData): Promise<NamingActionState> {
  const [viewer, event] = await Promise.all([getViewer(), getEvent()]);
  if (!viewer) return { error: "Oy vermek için GitHub ile giriş yap." };
  const proposalId = String(form.get("proposalId") ?? "");
  if (!UUID.test(proposalId)) return { error: "Geçersiz isim seçimi." };
  const { error } = await createAdminClient().from("mascot_name_votes").insert({
    event_id: event.id, voter_id: viewer.id, voter_login: viewer.login, proposal_id: proposalId,
  });
  if (error) return { error: message(error) };
  revalidatePath("/maskot");
  return { ok: true };
}

export async function setMascotPhase(_previous: NamingActionState, form: FormData): Promise<NamingActionState> {
  const [viewer, event] = await Promise.all([getViewer(), getEvent()]);
  const denied = await manageError(viewer, event);
  if (denied) return { error: denied };
  const next = String(form.get("phase") ?? "") as NamingPhase;
  if (next !== "oylama" && next !== "sonuc") return { error: "Geçersiz aşama." };
  const previous = next === "oylama" ? "oneriler" : "oylama";
  const db = createAdminClient();
  if (next === "oylama") {
    const { count, error } = await db.from("mascot_name_proposals").select("id", { count: "exact", head: true })
      .eq("event_id", event.id).eq("visible", true);
    if (error) return { error: message(error) };
    if (!count) return { error: "Oylamayı açmadan önce en az bir isim önerisi gerekli." };
  }
  const { data, error } = await db.from("mascot_naming_rounds").update({ phase: next })
    .eq("event_id", event.id).eq("phase", previous).select("event_id").maybeSingle();
  if (error) return { error: message(error) };
  if (!data) return { error: "Aşama zaten değişmiş. Sayfayı yenile." };
  revalidatePath("/maskot");
  return { ok: true };
}

export async function setMascotProposalVisibility(_previous: NamingActionState, form: FormData): Promise<NamingActionState> {
  const [viewer, event] = await Promise.all([getViewer(), getEvent()]);
  const denied = await manageError(viewer, event);
  if (denied) return { error: denied };
  const proposalId = String(form.get("proposalId") ?? "");
  if (!UUID.test(proposalId)) return { error: "Geçersiz öneri." };
  const visible = form.get("visible") === "true";
  const { data, error } = await createAdminClient().from("mascot_name_proposals")
    .update({ visible }).eq("id", proposalId).eq("event_id", event.id).select("id").maybeSingle();
  if (error) return { error: message(error) };
  if (!data) return { error: "Öneri bulunamadı." };
  revalidatePath("/maskot");
  return { ok: true };
}
