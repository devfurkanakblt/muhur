"use client";

import { useActionState, useMemo, useRef } from "react";
import { submitVersion, transferOwner, withdrawProject } from "@/app/actions";
import type { Member } from "@/lib/data";
import { buttonStyles } from "@/components/button-styles";
import { useProtectedForm } from "@/components/protected-form";

export function SubmissionButton({ eventId, pendingJob, hasVersion, suspended = false }: { eventId: string; pendingJob: boolean; hasVersion: boolean; suspended?: boolean }) {
  // Eylem sabit kalmalı (useActionState ilk eylemle karşılaştırır); etkinlik değişmedikçe aynı bağlı eylem kullanılır.
  const submit = useMemo(() => submitVersion.bind(null, eventId), [eventId]);
  const [state, action, pending] = useActionState(submit, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return <form {...protectedForm} data-live-safe>
    <button disabled={pending || pendingJob || suspended} aria-busy={pending || pendingJob} className={buttonStyles.primary}>
      {pending || pendingJob ? "Teslim sürümü hazırlanıyor…" : hasVersion ? "Teslim sürümünü güncelle" : "Kodunu teslim et"}
    </button>
    {state?.error && <p role="alert" className="mt-3 text-danger">{state.error}</p>}
    {state?.notice && <p role="status" className="mt-3 max-w-[60ch] text-ink-2">{state.notice}</p>}
    {state?.ok && !pendingJob && <p role="status" className="mt-3 text-ink-2">Güncelleme kuyruğa alındı. Kabul edildi durumunu kontrol et.</p>}
  </form>;
}

export function TransferOwnerForm({ eventId, members }: { eventId: string; members: Member[] }) {
  const [state, action, pending] = useActionState(transferOwner, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return <details className="mt-6">
    <summary className="cursor-pointer text-[0.875rem] text-ink-2">Kuruculuğu devret</summary>
    <form {...protectedForm} className="mt-4 grid max-w-[480px] gap-3">
      <input type="hidden" name="event" value={eventId} />
      <p className="text-[0.875rem] text-ink-2">Seçtiğin üye davetleri ve ekibi yönetecek; sen ekip üyesi olarak kalacaksın.</p>
      <label htmlFor="new-owner" className="text-[0.875rem]">Yeni kurucu</label>
      <select id="new-owner" name="target" required className="h-11 border border-rule bg-plinth px-3">
        <option value="">Ekip üyesi seç</option>
        {members.filter(m => m.role === "member").map(m => <option key={m.user_id} value={m.user_id}>{m.github_login}</option>)}
      </select>
      <label className="flex items-start gap-2 text-[0.875rem]"><input type="checkbox" required className="mt-1" /> Kurucu yetkilerimi bu üyeye devretmek istiyorum.</label>
      <button disabled={pending} className={buttonStyles.ghost}>{pending ? "Devrediliyor…" : "Kuruculuğu devret"}</button>
      <button type="reset" disabled={pending} className={buttonStyles.quiet}>Vazgeç</button>
      {state?.error && <p role="alert" className="text-danger">{state.error}</p>}
      {state?.ok && <p role="status">Kuruculuk devredildi.</p>}
    </form>
  </details>;
}

export function WithdrawProjectForm({ eventId, name }: { eventId: string; name: string }) {
  const [state, action, pending] = useActionState(withdrawProject, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} className="press text-[0.875rem] text-ink-3 hover:text-danger">Projeyi vitrinden geri çek</button>
    <dialog ref={dialog} className="m-auto w-[min(92vw,480px)] border border-rule bg-wall p-6 text-ink backdrop:bg-black/40" aria-labelledby="withdraw-title">
      <h2 id="withdraw-title" className="text-xl font-semibold">Projeyi geri çek</h2>
      <p className="mt-3 text-ink-2">Proje kaydı, ekip üyelikleri ve teslim arşivleri silinecek. Bu işlem geri alınamaz.</p>
      <form {...protectedForm} className="mt-5 grid gap-3">
        <input type="hidden" name="event" value={eventId} />
        <label htmlFor="withdraw-confirmation">Onaylamak için <strong className="break-all">{name}</strong> yaz.</label>
        <input id="withdraw-confirmation" name="confirmation" required autoComplete="off" className="h-12 border border-rule bg-plinth px-3" />
        {state?.error && <p role="alert" className="text-danger">{state.error}</p>}
        <div className="mt-2 flex flex-wrap gap-3">
          <button type="button" disabled={pending} onClick={() => dialog.current?.close()} className={buttonStyles.ghost}>Vazgeç</button>
          <button disabled={pending} className="press rounded-[2px] bg-danger px-4 py-3 text-white disabled:opacity-50">{pending ? "Geri çekiliyor…" : "Projeyi ve arşivleri sil"}</button>
        </div>
      </form>
    </dialog>
  </>;
}
