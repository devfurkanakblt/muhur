"use client";

import { useActionState } from "react";
import { HeartIcon } from "@phosphor-icons/react";
import { vote, type FormState } from "@/app/actions";
import { useProtectedForm } from "@/components/protected-form";

/** Halkın seçimi: tek oy, değiştirilebilir. Kendi ekibine oy verilemez. */
export function VoteButton({ projectId, voted, own, signedIn }: { projectId: string; voted: boolean; own: boolean; signedIn: boolean }) {
  // Eylem sabit kalmalı: useActionState yeni eylemi yalnızca ilk render'daki eylemle karşılaştırır. Eylem
  // ver → geri al → ver diye değişirse düğme "Oy ver" gösterirken geri alma eyleminde takılı kalır.
  const [state, action, pending] = useActionState<FormState, FormData>(vote, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  if (own) return <p className="text-[0.8125rem] text-ink-3">Kendi eserine oy veremezsin.</p>;
  if (!signedIn) return <p className="text-[0.8125rem] text-ink-3">Oy vermek için giriş yap.</p>;
  return (
    <form {...protectedForm} data-live-safe className="flex flex-col items-start gap-1">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="intent" value={voted ? "withdraw" : "cast"} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        aria-pressed={voted}
        className="press inline-flex h-9 items-center gap-2 rounded-[2px] border border-rule-strong px-3 text-[0.875rem] hover:border-ink aria-pressed:border-transparent aria-pressed:bg-blush aria-pressed:text-[#0b0d1e]"
      >
        <HeartIcon size={16} weight={voted ? "fill" : "regular"} className={voted ? "text-[#e8536b]" : undefined} />
        {pending ? "Kaydediliyor…" : voted ? "Oyun burada" : "Oy ver"}
      </button>
      {state?.error && <span className="text-[0.8125rem] text-danger">{state.error}</span>}
    </form>
  );
}
