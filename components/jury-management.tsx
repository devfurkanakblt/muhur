import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { getEventInvites } from "@/lib/community";
import { CommunityRoleForm, RoleInviteForm } from "@/components/community-forms";
import type { EventState } from "@/lib/data";
export async function JuryManagement({ event, canManage }: { event: EventState; canManage: boolean }) {
 const [result,invites] = await Promise.all([createAdminClient().from("event_jurors").select("user_id,login,provider").eq("event_id",event.id),getEventInvites(event.id)]);
 if(result.error) throw new Error("Jüri listesi okunamadı.");
 return <section className="grid gap-6 border-t border-rule pt-7"><h2 className="text-xl font-semibold">Jüri ekibi</h2><p className="max-w-[65ch] text-ink-2">Jüri arşivleri mühürden sonra inceleyebilir. Puanlama veya etkinlik yönetim yetkisi verilmez.</p>
 <ul className="divide-y divide-rule">{(result.data??[]).map(j=><li key={j.user_id} className="grid gap-3 py-4"><p>{j.login} <span className="text-sm text-ink-3">· {j.provider === "linkedin" ? "LinkedIn" : "GitHub"}</span></p>{canManage&&<CommunityRoleForm scope={event.id} operation="remove-juror" target={j.user_id} label="Jüri üyeliğini kaldır" />}</li>)}</ul>
 {canManage&&<RoleInviteForm kind="juri" scope={event.id} requestId={randomUUID()} />}
 {invites.length>0&&<ul className="divide-y divide-rule">{invites.map(i=><li key={i.id} className="grid gap-3 py-4"><p className="break-all">{i.recipient_email} <span className="text-sm text-ink-3">· {i.accepted_at ? "Kabul edildi" : i.revoked_at ? "İptal edildi" : "Kabul bekliyor"}</span></p>{canManage&&!i.accepted_at&&!i.revoked_at&&<CommunityRoleForm scope={i.id} operation="revoke" label="Daveti iptal et" />}</li>)}</ul>}
 </section>;
}
