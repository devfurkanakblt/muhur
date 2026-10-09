"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import { useProtectedForm } from "@/components/protected-form";
import { buttonStyles } from "@/components/button-styles";

const ActionPending = createContext(false);
type Result = { ok?: boolean; error?: string } | undefined;

/** One request at a time, including clicks before React paints disabled state. */
export function ActionForm({ action, children, className }: {
  action: (data: FormData) => Promise<void | Result>;
  children: ReactNode;
  className?: string;
}) {
  const [state, dispatch, pending] = useActionState(async (_previous: Result, data: FormData) => {
    const result = await action(data);
    return result ?? { ok: true };
  }, undefined);
  const protectedForm = useProtectedForm(dispatch, state, pending);
  return <ActionPending.Provider value={pending}>
    <form {...protectedForm} className={className} data-live-safe aria-busy={pending}>
      {children}
      {state?.error && <p role="alert" className="mt-2 text-[0.9375rem] text-danger">{state.error}</p>}
    </form>
  </ActionPending.Provider>;
}

export function ActionButton({ children, pending: label, className = buttonStyles.ink, disabled = false }: {
  children: ReactNode; pending: string; className?: string; disabled?: boolean;
}) {
  const pending = useContext(ActionPending);
  return <button type="submit" disabled={disabled || pending} aria-busy={pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
    {pending ? label : children}
  </button>;
}
