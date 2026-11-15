"use client";

import { useActionState } from "react";
import { joinProject, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/buttons";
import { useProtectedForm } from "@/components/protected-form";
import { ParticipantConsent, type ParticipantConsentProps } from "@/components/policy-consent-form";

/** `consent`: etkinliğe ilk katılımda iki ayrı onay; aynı etkinliğe daha önce kaydolan kişide gösterilmez. */
export function JoinForm({ eventId, code, suspended = false, consent = null }: { eventId: string; code: string; suspended?: boolean; consent?: ParticipantConsentProps | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(joinProject, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return (
    <form {...protectedForm} data-live-safe className="grid gap-6">
      <input type="hidden" name="event" value={eventId} />
      <input type="hidden" name="code" value={code} />
      {consent && <ParticipantConsent {...consent} disabled={pending} />}
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton busy={pending} disabled={suspended} pending="Katılınıyor…">Ekibe katıl</SubmitButton>
        {state?.error && (
          <p role="alert" className="text-[0.9375rem] text-danger">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
