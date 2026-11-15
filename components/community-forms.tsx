"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useProtectedForm } from "@/components/protected-form";
import { buttonStyles } from "@/components/button-styles";
import { acceptRoleInvite, changeCommunityRole, createRoleInvite, retryCommunityMail, reviewApplication, submitApplication, type CommunityActionState } from "@/app/topluluk/actions";
import type { CommunityMember, PolicyDocument } from "@/lib/community";
import { PolicyCheckboxes, type ConsentDocument } from "@/components/policy-consent-form";
const input = "min-h-12 w-full rounded-[2px] border border-rule-strong bg-plinth px-3 py-2 text-base text-ink focus:border-ink focus:outline-none";
function Result({ state, success = "İşlem tamamlandı." }: { state: CommunityActionState; success?: string }) {
  return state?.error ? <p role="alert" className="text-[0.9375rem] text-danger">{state.error}</p> : state?.ok ? <p role="status" className="text-[0.9375rem] text-ink-2">{state.notice ?? success}</p> : null;
}
function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) { return <div className="grid gap-2"><label htmlFor={id} className="text-[0.9375rem] font-medium">{label}</label>{children}</div>; }
function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) { return <button type="submit" disabled={pending} className={buttonStyles.primary}>{pending ? "Kaydediliyor…" : children}</button>; }
export function ApplicationForm({ policies, requestId, previousId = "" }: { policies: PolicyDocument[]; requestId: string; previousId?: string }) {
  const [state, action, pending] = useActionState(submitApplication, undefined); const protectedForm = useProtectedForm(action, state, pending);
  return <form {...protectedForm} className="grid max-w-[720px] gap-10" aria-busy={pending}>
    <input type="hidden" name="request_id" value={requestId} /><input type="hidden" name="previous_application_id" value={previousId} />
    <fieldset disabled={pending} className="grid min-w-0 gap-5"><legend className="mb-5 text-xl font-semibold">Topluluğun</legend>
      <Field id="community-name" label="Topluluk adı"><input className={input} id="community-name" name="name" required minLength={2} maxLength={80} autoComplete="organization" /></Field>
      <Field id="community-slug" label="Adres kısaltması"><input className={input} id="community-slug" name="slug" required pattern={"[a-z0-9\\-]{3,40}"} maxLength={40} autoCapitalize="none" spellCheck={false} placeholder="universite-toplulugu" /></Field>
      <Field id="university" label="Üniversite / kurum"><input className={input} id="university" name="university" maxLength={160} /></Field>
      <Field id="city" label="Şehir"><input className={input} id="city" name="city" maxLength={80} autoComplete="address-level2" /></Field>
      <Field id="community-link" label="Web / sosyal medya bağlantısı (isteğe bağlı)"><input className={input} id="community-link" name="link" type="url" maxLength={2048} placeholder="https://" /></Field>
    </fieldset>
    <fieldset disabled={pending} className="grid min-w-0 gap-5 border-t border-rule pt-8"><legend className="mb-5 text-xl font-semibold">Sorumlu kişi</legend>
      <Field id="contact-name" label="Ad soyad"><input className={input} id="contact-name" name="contact_name" required minLength={2} maxLength={120} autoComplete="name" /></Field>
      <Field id="contact-email" label="E-posta"><input className={input} id="contact-email" name="contact_email" type="email" required maxLength={254} autoComplete="email" /></Field>
      <Field id="contact-phone" label="Telefon (ülke koduyla)"><input className={input} id="contact-phone" name="contact_phone" type="tel" required minLength={3} maxLength={32} autoComplete="tel" /></Field>
    </fieldset>
    <fieldset disabled={pending} className="grid min-w-0 gap-5 border-t border-rule pt-8"><legend className="mb-5 text-xl font-semibold">Belgeler</legend>
      {policies.map(p => <label key={p.id} className="flex items-start gap-3 text-[0.9375rem] leading-relaxed">
        <input type="hidden" name={`${p.kind}_document`} value={p.id} /><input type="checkbox" required name={`accept_${p.kind}`} className="mt-1 h-5 w-5 shrink-0" />
        <span><Link href={`/kosullar/${p.kind === "platform" ? "platform" : "veri-isleme"}/${encodeURIComponent(p.version)}`} target="_blank" className="underline underline-offset-4">{p.kind === "platform" ? "Platform Kullanım Sözleşmesi’ni" : "Veri işleme ekini"}</Link> topluluk adına okudum ve kabul ediyorum. <span className="text-ink-3">Sürüm {p.version}; yeni sekmede açılır.</span></span>
      </label>)}
    </fieldset>
    <div className="flex flex-wrap items-center gap-4"><Submit pending={pending}>Başvuruyu gönder</Submit><button type="reset" disabled={pending} className="min-h-11 underline underline-offset-4">Değişiklikleri geri al</button><Result state={state} /></div>
  </form>;
}
export function ReviewApplicationForm({ communityId }: { communityId: string }) {
  const [state, action, pending] = useActionState(reviewApplication, undefined); const protectedForm = useProtectedForm(action, state, pending);
  return <form {...protectedForm} className="grid gap-3" aria-busy={pending}><input type="hidden" name="community" value={communityId} />
    <Field id={`reason-${communityId}`} label="Ret gerekçesi (ret için 3–500 karakter)"><textarea id={`reason-${communityId}`} name="reason" maxLength={500} rows={2} className={input} disabled={pending} /></Field>
    <div className="flex flex-wrap items-center gap-4"><button name="decision" value="onaylandi" disabled={pending} className={buttonStyles.ink}>{pending ? "Kaydediliyor…" : "Onayla"}</button><button name="decision" value="reddedildi" disabled={pending} className={buttonStyles.ghost}>Gerekçeyle reddet</button><Result state={state} /></div>
  </form>;
}
export function RoleInviteForm({ kind, scope, requestId }: { kind: "juri" | "organizator"; scope: string; requestId: string }) {
  const [request, setRequest] = useState(requestId);
  const [state, action, pending] = useActionState(async (previous: CommunityActionState, form: FormData) => {
    const result = await createRoleInvite(previous, form);
    if (result?.ok) setRequest(crypto.randomUUID());
    return result;
  }, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return <form {...protectedForm} className="grid max-w-[600px] gap-4" aria-busy={pending}>
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="scope" value={scope} /><input type="hidden" name="request_id" value={request} />
    <Field id={`invite-email-${scope}`} label={kind === "juri" ? "Jüri üyesinin e-postası" : "Organizatörün e-postası"}><input type="email" required maxLength={254} name="email" id={`invite-email-${scope}`} className={input} disabled={pending} /></Field>
    <p className="text-sm leading-relaxed text-ink-2">Tek kullanımlık bağlantı 7 gün geçerli. {kind === "juri" ? "GitHub veya LinkedIn ile kabul edilebilir; bu etkinlikte yarışan kişi kabul edemez." : "GitHub ile kabul edilir. Açık etkinliğinizde yarışan kişi organizatör olamaz."}</p>
    <div className="flex flex-wrap items-center gap-4"><Submit pending={pending}>Davet oluştur ve e-postaya al</Submit><Result state={state} success="Davet oluşturuldu; e-posta kuyruğunda." /></div>
    {state?.link && <Field id={`invite-link-${scope}`} label="Davet bağlantısı (yalnızca şimdi gösterilir)"><input readOnly value={state.link} id={`invite-link-${scope}`} className={input} onFocus={e => e.currentTarget.select()} /></Field>}
  </form>;
}
/** Organizatör davetinde rol, topluluk adına belge kabulüyle aynı işlemde kurulur (`documents` boşsa belge yok). */
export function AcceptRoleInviteForm({ token, documents = [] }: { token: string; documents?: ConsentDocument[] }) {
  const [state, action, pending] = useActionState(acceptRoleInvite, undefined); const protectedForm = useProtectedForm(action, state, pending);
  return <form {...protectedForm} className="grid justify-items-start gap-6" aria-busy={pending}><input type="hidden" name="token" value={token} />
    {documents.length > 0 && <PolicyCheckboxes documents={documents} disabled={pending} intro="Organizatör olarak topluluk adına güncel belgeleri ayrı ayrı onayla" />}
    <div className="flex flex-wrap items-center gap-4"><Submit pending={pending}>Daveti kabul et</Submit><Result state={state} /></div></form>;
}
export function CommunityRoleForm({ scope, operation, members = [], target, label }: { scope: string; operation: "remove" | "transfer" | "recover" | "suspend" | "unsuspend" | "revoke" | "remove-juror"; members?: CommunityMember[]; target?: string; label: string }) {
  const [state, action, pending] = useActionState(changeCommunityRole, undefined); const protectedForm = useProtectedForm(action, state, pending); const id = `${operation}-${scope}-${target ?? "choice"}`;
  return <form {...protectedForm} className="grid max-w-[600px] gap-3" aria-busy={pending}>
    <input type="hidden" name="scope" value={scope} /><input type="hidden" name="operation" value={operation} />
    {target ? <input type="hidden" name="target" value={target} /> : operation === "transfer" ? <Field id={id} label="Yeni sahip olacak organizatör"><select id={id} name="target" required className={input} disabled={pending} defaultValue=""><option value="">Organizatör seç</option>{members.filter(m => m.role === "organizator").map(m => <option key={m.user_id} value={m.user_id}>{m.github_login}</option>)}</select></Field> : operation === "recover" ? <Field id={id} label="Yeni sahibin kullanıcı UUID’si"><input name="target" id={id} required className={input} disabled={pending} /></Field> : null}
    {["suspend", "unsuspend", "recover"].includes(operation) && <Field id={`${id}-reason`} label="Gerekçe"><textarea name="reason" id={`${id}-reason`} required minLength={3} maxLength={500} rows={2} className={input} disabled={pending} /></Field>}
    {operation === "transfer" && <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="confirm" required disabled={pending} className="mt-1" />Sahipliği devredince organizatör olacağımı onaylıyorum.</label>}
    <div className="flex flex-wrap items-center gap-4"><Submit pending={pending}>{label}</Submit><Result state={state} /></div>
  </form>;
}
export function RetryCommunityMailForm({ id, uncertain }: { id: string; uncertain: boolean }) {
  const [state, action, pending] = useActionState(retryCommunityMail, undefined); const protectedForm = useProtectedForm(action, state, pending);
  return <form {...protectedForm} className="mt-3 grid gap-3" aria-busy={pending}><input type="hidden" name="job" value={id} />
    {uncertain && <label className="flex items-start gap-3 text-sm"><input name="confirm" type="checkbox" required disabled={pending} className="mt-1" />Brevo kaydını kontrol ettim; tekrar gönderilmesini onaylıyorum.</label>}
    <div className="flex flex-wrap items-center gap-4"><Submit pending={pending}>E-postayı yeniden sıraya al</Submit><Result state={state} /></div>
  </form>;
}
