"use client";

import { useActionState } from "react";
import { joinProject, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/buttons";
import { useProtectedForm } from "@/components/protected-form";

export function JoinForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(joinProject, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return (
    <form {...protectedForm} data-live-safe className="flex flex-wrap items-center gap-4">
      <input type="hidden" name="code" value={code} />
      <SubmitButton busy={pending} pending="Katılınıyor…">Ekibe katıl</SubmitButton>
      {state?.error && (
        <p role="alert" className="text-[0.9375rem] text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
