"use client";

import { useActionState, useEffect, useRef } from "react";
import { huntMystery } from "@/app/actions";
import { buttonStyles } from "@/components/button-styles";
import { Mascot } from "@/components/mascot/mascot";
import { useProtectedForm } from "@/components/protected-form";

/**
 * Gizem avcısı: açılış videosundaki gizli mesajı çözen Ctrl/Cmd+Shift+S'ye basar ve cümleyi yazar.
 * Cevap sunucuda denetlenir; bu bileşen cevabı bilmez. Ctrl+S esprisi (SaveEgg) Shift'siz basışı alır.
 */
export function MysteryEgg() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(huntMystery, undefined);
  const protectedForm = useProtectedForm(action, state, pending);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dialog.current && !dialog.current.open) {
          dialog.current.showModal();
          input.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const solved = Boolean(state?.ok);
  return (
    <dialog ref={dialog} aria-labelledby="mystery-title" className="m-auto w-[min(92vw,480px)] border border-rule bg-wall p-6 text-ink backdrop:bg-black/40">
      <div className="flex items-center gap-4">
        <Mascot mood={solved ? "mutlu" : "merakli"} title="" className="w-16 shrink-0" />
        <h2 id="mystery-title" className="text-xl font-semibold">
          {solved ? "Gizem avcısı!" : "Bir şey mi biliyorsun?"}
        </h2>
      </div>
      {solved ? (
        <p role="status" className="mt-4 text-ink-2">{state?.status}</p>
      ) : (
        <form {...protectedForm} data-live-safe className="mt-5 grid gap-3" aria-busy={pending}>
          <label htmlFor="mystery-answer">Gizli cümleyi yaz.</label>
          <input
            ref={input}
            id="mystery-answer"
            name="answer"
            required
            maxLength={120}
            autoComplete="off"
            spellCheck={false}
            className="h-12 border border-rule bg-plinth px-3"
          />
          {state?.error && <p role="alert" className="text-danger">{state.error}</p>}
          {state?.notice && <p role="status" className="text-ink-2">{state.notice}</p>}
          <div className="mt-2 flex flex-wrap gap-3">
            <button type="button" disabled={pending} onClick={() => dialog.current?.close()} className={buttonStyles.ghost}>Vazgeç</button>
            <button disabled={pending} aria-busy={pending} className={buttonStyles.primary}>{pending ? "Bakılıyor…" : "Gönder"}</button>
          </div>
        </form>
      )}
      {solved && (
        <div className="mt-5">
          <button type="button" onClick={() => dialog.current?.close()} className={buttonStyles.ghost}>Kapat</button>
        </div>
      )}
    </dialog>
  );
}
