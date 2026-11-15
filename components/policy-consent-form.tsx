"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useProtectedForm } from "@/components/protected-form";
import { buttonStyles } from "@/components/button-styles";
import { acceptManagementPolicies, type CommunityActionState } from "@/app/topluluk/actions";
import { policyPath, policyTitle, type PolicyKind } from "@/lib/policies";

export type ConsentDocument = { id: string; kind: PolicyKind; version: string };

/**
 * Her belge için ayrı, önceden işaretlenmemiş checkbox. Gizli alan yalnız gösterilen sürümü bildirir;
 * onay sayılan şey checkbox'ın kendisidir. Belge yeni sekmede açılır; form içeriği kaybolmaz.
 */
export function PolicyCheckboxes({ documents, disabled, intro }: { documents: ConsentDocument[]; disabled?: boolean; intro: string }) {
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4">
      <legend className="mb-4 text-[0.9375rem] font-medium">{intro}</legend>
      {documents.map((doc, i) => (
        <label key={doc.id} className="flex items-start gap-3 text-[0.9375rem] leading-relaxed">
          <input type="hidden" name="policy_document" value={doc.id} />
          <input type="checkbox" required name={`accept_policy_${i}`} className="mt-1 h-5 w-5 shrink-0" />
          <span className="min-w-0">
            <Link href={policyPath(doc.kind, doc.version)} target="_blank" className="break-words underline underline-offset-4">{policyTitle(doc.kind)}</Link>
            {" "}metnini okudum ve topluluk adına kabul ediyorum.{" "}
            <span className="text-ink-3">Sürüm {doc.version}; yeni sekmede açılır.</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function PolicyConsentForm({ communityId, documents, next }: { communityId: string; documents: ConsentDocument[]; next: string }) {
  const [state, action, pending] = useActionState<CommunityActionState, FormData>(acceptManagementPolicies, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return (
    <form {...protectedForm} className="grid max-w-[640px] gap-8" aria-busy={pending}>
      <input type="hidden" name="community" value={communityId} />
      <input type="hidden" name="next" value={next} />
      <PolicyCheckboxes documents={documents} disabled={pending} intro="Belgeleri ayrı ayrı onayla" />
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>{pending ? "Kaydediliyor…" : "Onayla ve devam et"}</button>
        {state?.error && <p role="alert" className="text-[0.9375rem] text-danger">{state.error}</p>}
      </div>
    </form>
  );
}

/** Katılımcının etkinliğe ilk kaydı: platform katılımcı koşulları ve etkinlik kuralları iki ayrı onaydır. */
export type ParticipantConsentProps = {
  document: ConsentDocument;
  terms: { id: string; version: number; rulesUrl: string; privacyUrl: string };
  disabled?: boolean;
};
export function ParticipantConsent({ document, terms, disabled }: ParticipantConsentProps) {
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4 border-t border-rule pt-6">
      <legend className="mb-4 text-[0.9375rem] font-medium">Bu etkinliğe ilk kaydın için iki ayrı onay</legend>
      <input type="hidden" name="participant_document" value={document.id} />
      <input type="hidden" name="event_terms_version" value={terms.id} />
      <label className="flex items-start gap-3 text-[0.9375rem] leading-relaxed">
        <input type="checkbox" required name="accept_participant" className="mt-1 h-5 w-5 shrink-0" />
        <span className="min-w-0">
          <Link href={policyPath(document.kind, document.version)} target="_blank" className="underline underline-offset-4">Mühür katılımcı koşullarını</Link>
          {" "}okudum ve kabul ediyorum. <span className="text-ink-3">Sürüm {document.version}; yeni sekmede açılır.</span>
        </span>
      </label>
      <label className="flex items-start gap-3 text-[0.9375rem] leading-relaxed">
        <input type="checkbox" required name="accept_event_terms" className="mt-1 h-5 w-5 shrink-0" />
        <span className="min-w-0">
          Etkinliğin{" "}
          <a href={terms.rulesUrl} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4">kurallarını ↗</a>
          {" "}ve{" "}
          <a href={terms.privacyUrl} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4">aydınlatma metnini ↗</a>
          {" "}okudum ve kabul ediyorum. <span className="text-ink-3">Kural sürümü {terms.version}; topluluğun sayfasında açılır.</span>
        </span>
      </label>
    </fieldset>
  );
}
