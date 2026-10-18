"use client";

import { startTransition, useEffect, useRef, type FormEvent } from "react";
import { FormChanges } from "@/lib/live-policy";

export const formChanges = new FormChanges<HTMLFormElement>();
export const FORM_SAVED = "muhur:form-saved";
export const REFRESH_REQUESTED = "muhur:refresh-requested";
export const FORM_PENDING = "muhur:form-pending";

/** Keep inputs on action errors and only clear the submitted form's revision. */
export function useProtectedForm(
  action: (data: FormData) => void,
  state: { ok?: boolean; error?: string } | undefined,
  pending: boolean,
) {
  const ref = useRef<HTMLFormElement>(null);
  const submitted = useRef<number | null>(null);
  const resultSeen = useRef<typeof state>(undefined);
  const submitting = useRef(false);
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) { wasPending.current = true; return; }
    if (wasPending.current || (state && state !== resultSeen.current)) {
      submitting.current = false;
      wasPending.current = false;
      if (ref.current) formChanges.finish(ref.current);
      window.dispatchEvent(new Event(FORM_PENDING));
    }
    if (pending || !state || state === resultSeen.current) return;
    resultSeen.current = state;
    const form = ref.current;
    if (state.ok && form && submitted.current !== null) {
      formChanges.saved(form, submitted.current);
      window.dispatchEvent(new CustomEvent(FORM_SAVED, { detail: { form } }));
    } else window.dispatchEvent(new Event(FORM_SAVED));
  }, [state, pending]);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || submitting.current) return;
    submitting.current = true;
    formChanges.begin(event.currentTarget);
    window.dispatchEvent(new Event(FORM_PENDING));
    submitted.current = formChanges.revision(event.currentTarget);
    // Basılan düğmenin name/value'su da gönderilir (ör. aynı formda "Yemek" ve "Etkinlik").
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(data));
  };
  return { ref, onSubmit };
}
