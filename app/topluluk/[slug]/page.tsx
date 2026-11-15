import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getEvents, getViewer, getRequestNow } from "@/lib/data";
import { getCommunityScope, getCommunityMembers, getCommunityInvites, getMailSummaries } from "@/lib/community";
import { createAdminClient } from "@/lib/supabase/server";
import { CommunityLayout, CommunitySection } from "@/components/community-layout";
import { CommunityRoleForm, RoleInviteForm, RetryCommunityMailForm } from "@/components/community-forms";
import { formatDateTime } from "@/lib/format";
import { getCommunityManagementEvidence, getManagementConsent } from "@/lib/policy-data";
import { policyTitle } from "@/lib/policies";
import { PolicyNotice } from "@/components/policy-notice";
export const metadata = { title: "Topluluk panosu" };
const mailState: Record<string,string> = { pending: "Sırada", leased: "Gönderiliyor", accepted: "Brevo kabul etti", uncertain: "Sonuç belirsiz; Brevo kaydını kontrol et", dead: "Gönderilemedi", cancelled: "İptal edildi" };
export default async function Page({ params }: PageProps<"/topluluk/[slug]">) {
 const { slug } = await params; const viewer = await getViewer(); const scope = await getCommunityScope(viewer,slug); if (!viewer || !scope) notFound();
 const { community, owner, canManage: roleCanManage } = scope; const now = getRequestNow();
 const [members, allEvents, invites, mail, consent, evidence] = await Promise.all([getCommunityMembers(community.id),getEvents(),owner || viewer.isHeadAdmin ? getCommunityInvites(community.id) : [],getMailSummaries(community.id, owner || viewer.isHeadAdmin),scope.role ? getManagementConsent(viewer.id, community.id) : null,owner ? getCommunityManagementEvidence(community.id) : []]);
 // Güncel onay eksikken (zorunluluk açık) yönetim formları gösterilmez; DB yazmayı ayrıca reddeder.
 const canManage = roleCanManage && !consent?.blocking;
 let contact: { contact_name: string; contact_email: string; contact_phone: string } | null = null;
 if (owner || viewer.isHeadAdmin) { const result = await createAdminClient().from("communities").select("contact_name,contact_email,contact_phone").eq("id",community.id).maybeSingle(); if(result.error) throw new Error("İletişim bilgileri okunamadı."); contact=result.data; }
 const events = allEvents.filter(e => e.communityId === community.id);
 return <CommunityLayout viewer={viewer} title={community.name} note={[community.university,community.city].filter(Boolean).join(" · ") || "Topluluk panosu"}>
 {consent && consent.missing.length > 0 && <PolicyNotice slug={community.slug} next={`/topluluk/${community.slug}`} blocking={consent.blocking} />}
 {community.status === "askida" && <p className="max-w-[65ch] leading-relaxed text-ink-2">Topluluk geçici olarak durduruldu. Yönetim işlemleri kapalı; mevcut kayıtları inceleyebilirsin. Gerekçe: {community.suspended_reason}</p>}
 <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
 <CommunitySection title="Etkinlikler">{events.length ? <ul className="divide-y divide-rule">{events.map(e => <li key={e.id} className="grid gap-2 py-4"><Link className="font-medium underline underline-offset-4" href={`/e/${e.slug}/yonetim`}>{e.title}</Link><p className="text-sm text-ink-2">{e.locked ? "Mühürlü" : "Açık"} · {formatDateTime(e.deadline)}</p></li>)}</ul> : <p className="text-ink-2">Henüz etkinlik yok.</p>}{canManage && <Link className="underline underline-offset-4" href="/yonetim">Yeni etkinlik oluştur</Link>}</CommunitySection>
 <CommunitySection title="Topluluk ekibi"><ul className="divide-y divide-rule">{members.map(m => <li key={m.user_id} className="grid gap-3 py-4"><p>{m.github_login} <span className="text-sm text-ink-3">· {m.role === "owner" ? "Sahip" : "Organizatör"}</span></p>{owner && canManage && m.role === "organizator" && <CommunityRoleForm operation="remove" scope={community.id} target={m.user_id} label="Organizatörü çıkar" />}</li>)}</ul></CommunitySection>
 </div>
 {owner && canManage && <CommunitySection title="Organizatör davet et"><RoleInviteForm kind="organizator" scope={community.id} requestId={randomUUID()} /></CommunitySection>}
 {invites.length > 0 && <CommunitySection title="Organizatör davetleri"><ul className="divide-y divide-rule">{invites.map(i => <li key={i.id} className="grid gap-3 py-4"><p className="break-all">{i.recipient_email}</p><p className="text-sm text-ink-3">{i.accepted_at ? "Kabul edildi" : i.revoked_at ? "İptal edildi" : +new Date(i.expires_at) <= now ? "Süresi doldu" : "Kabul bekliyor"} · {formatDateTime(i.created_at)}</p>{canManage && owner && !i.accepted_at && !i.revoked_at && <CommunityRoleForm operation="revoke" scope={i.id} label="Daveti iptal et" />}</li>)}</ul></CommunitySection>}
 <CommunitySection title="E-posta durumu">{mail.length ? <ul className="divide-y divide-rule">{mail.map(m => <li key={m.id} className="py-4"><p className="break-all">{m.recipient_email}</p><p className="mt-2 text-sm text-ink-2">{mailState[m.state] ?? m.state}{m.delivery_state === "delivered" ? " · Alıcıya teslim edildi" : m.delivery_state === "bounced" || m.delivery_state === "blocked" ? " · Alıcıya ulaştırılamadı" : ""}</p>{m.last_error && <p className="mt-2 text-sm text-ink-3">{m.last_error}</p>}{canManage && ["dead","uncertain"].includes(m.state) && !["organizer_invite","jury_invite"].includes(m.kind) && <RetryCommunityMailForm id={m.id} uncertain={m.state === "uncertain"} />}</li>)}</ul> : <p className="text-ink-2">Henüz e-posta işi yok.</p>}</CommunitySection>
 {owner && canManage && members.some(m => m.role === "organizator") && <CommunitySection title="Sahipliği devret"><p className="max-w-[60ch] text-ink-2">Yeni sahip mevcut organizatörlerden biri olmalı. Devirden sonra organizatör olarak kalırsın.</p><CommunityRoleForm operation="transfer" scope={community.id} members={members} label="Sahipliği devret" /></CommunitySection>}
 {owner && consent?.configured && <CommunitySection title="Belge onayları"><p className="max-w-[60ch] text-sm leading-relaxed text-ink-2">Ekibin bu topluluk adına onayladığı platform belgesi sürümleri. Yalnız sahip görür; katılımcıların etkinlik onayları burada yer almaz.</p><ul className="divide-y divide-rule">{evidence.map(m => { const current = consent.documents.every(d => m.accepted.some(a => a.kind === d.kind && a.version === d.version)); return <li key={m.userId} className="grid gap-2 py-4"><p>{m.login} <span className="text-sm text-ink-3">· {m.role === "owner" ? "Sahip" : "Organizatör"} · {current ? "Güncel sürümler onaylı" : "Güncel onay eksik"}</span></p>{m.accepted.length > 0 && <ul className="grid gap-1 text-sm text-ink-2">{m.accepted.map(a => <li key={`${a.kind}-${a.version}`}>{policyTitle(a.kind)} · sürüm {a.version} · {formatDateTime(a.acceptedAt)}</li>)}</ul>}</li>; })}</ul></CommunitySection>}
 {contact && <CommunitySection title="Başvuru iletişim bilgileri"><dl className="grid gap-2 text-sm sm:grid-cols-[180px_1fr]"><dt className="text-ink-3">Sorumlu</dt><dd>{contact.contact_name || "Belirtilmedi"}</dd><dt className="text-ink-3">E-posta</dt><dd className="break-all">{contact.contact_email || "Belirtilmedi"}</dd><dt className="text-ink-3">Telefon</dt><dd>{contact.contact_phone || "Belirtilmedi"}</dd></dl></CommunitySection>}
 </CommunityLayout>;
}
