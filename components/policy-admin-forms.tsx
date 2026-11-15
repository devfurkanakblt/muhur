"use client";
import { useActionState } from "react";
import { useProtectedForm } from "@/components/protected-form";
import { buttonStyles } from "@/components/button-styles";
import { publishPolicy, type PolicyAdminState } from "@/app/yonetim/belgeler/actions";

const input = "min-h-12 w-full rounded-[2px] border border-rule-strong bg-plinth px-3 py-2 text-base text-ink focus:border-ink focus:outline-none";

export function PublishPolicyForm({ documentId, expected, version }: { documentId: string; expected: string | null; version: string }) {
  const [state, action, pending] = useActionState<PolicyAdminState, FormData>(publishPolicy, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return (
    <form {...protectedForm} className="grid max-w-[600px] gap-4" aria-busy={pending}>
      <input type="hidden" name="document" value={documentId} />
      <input type="hidden" name="expected" value={expected ?? ""} />
      <label className="grid gap-2"><span className="text-[0.9375rem] font-medium">Yayın gerekçesi</span>
        <textarea name="reason" required minLength={3} maxLength={500} rows={2} className={input} disabled={pending} /></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="confirm" required disabled={pending} className="mt-1" />Sürüm {version} metnini okudum; yayınlandıktan sonra değiştirilemeyeceğini ve yöneticilerden yeniden onay isteneceğini biliyorum.</label>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={buttonStyles.ink}>{pending ? "Yayınlanıyor…" : "Bu sürümü yayınla"}</button>
        {state?.error && <p role="alert" className="text-[0.9375rem] text-danger">{state.error}</p>}
        {state?.ok && <p role="status" className="text-[0.9375rem] text-ink-2">Yayınlandı.</p>}
      </div>
    </form>
  );
}
