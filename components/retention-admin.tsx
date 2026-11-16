"use client";
import { useActionState } from "react";
import { confirmArchiveReaders, setArchiveRetention, type RetentionActionState } from "@/app/yonetim/arsiv-actions";
import { useProtectedForm } from "@/components/protected-form";
import { SubmitButton } from "@/components/buttons";

const input = "w-full rounded-[2px] border border-rule-strong bg-plinth px-3 py-3 text-[0.9375rem] focus:border-ink focus:outline-none";
function Status({ state }: { state: RetentionActionState }) {
  if (state?.error) return <p role="alert" className="text-[0.9375rem] text-danger">{state.error}</p>;
  if (state?.ok) return <p role="status" className="text-[0.9375rem] text-ink-2">{state.notice}</p>;
  return null;
}

export function ConfirmReadersForm() {
  const [state, action, pending] = useActionState(confirmArchiveReaders, undefined);
  const form = useProtectedForm(action, state, pending);
  return <form {...form} className="grid max-w-[620px] gap-3">
    <label htmlFor="readers-reason" className="text-[0.9375rem] font-medium">Gerekçe</label>
    <textarea id="readers-reason" name="reason" required minLength={3} maxLength={500} rows={2} className={input} placeholder="Ör. Okuyucu yayını tamamlandı; kuru koşum raporu incelendi." />
    <label className="flex items-start gap-2 text-[0.9375rem]"><input type="checkbox" name="confirm" required className="mt-1" /> Arşiv, jüri ve doğrulama okuyucularının bu sürümde yayında olduğunu onaylıyorum. Bu işlem silmeyi açmaz.</label>
    <div className="flex flex-wrap items-center gap-4"><SubmitButton variant="ghost" busy={pending} pending="Kuru koşum çalışıyor…">Kuru koşumu çalıştır ve kaydet</SubmitButton><Status state={state} /></div>
  </form>;
}

export function RetentionToggleForm({ enabled, gateOpen }: { enabled: boolean; gateOpen: boolean }) {
  const [state, action, pending] = useActionState(setArchiveRetention, undefined);
  const form = useProtectedForm(action, state, pending);
  return <form {...form} className="grid max-w-[620px] gap-3">
    <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
    <label htmlFor="retention-reason" className="text-[0.9375rem] font-medium">{enabled ? "Kapatma gerekçesi" : "Açma gerekçesi"}</label>
    <textarea id="retention-reason" name="reason" required minLength={3} maxLength={500} rows={2} className={input} />
    {!enabled && <label className="flex items-start gap-2 text-[0.9375rem]"><input type="checkbox" name="confirm" required className="mt-1" /> Kilitten 30 gün geçmiş ZIP dosyaları depodan geri getirilemeyecek şekilde silinecek. Mühür ve doğrulama kayıtları kalır. Kullanıcıdan açık onay alındı.</label>}
    {!enabled && !gateOpen && <p className="text-[0.9375rem] text-ink-2">Aktivasyon migration&apos;ı (0021) uygulanmadan açılamaz.</p>}
    <div className="flex flex-wrap items-center gap-4"><SubmitButton variant={enabled ? "ink" : "ghost"} busy={pending} pending="Kaydediliyor…" disabled={!enabled && !gateOpen}>{enabled ? "Süreli silmeyi durdur" : "Süreli silmeyi aç"}</SubmitButton><Status state={state} /></div>
  </form>;
}
