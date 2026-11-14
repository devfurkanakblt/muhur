"use client";

import { useFormStatus } from "react-dom";
import { GithubLogoIcon } from "@phosphor-icons/react";
import { signIn } from "@/app/actions";
import { buttonStyles } from "@/components/button-styles";
import { ActionForm, ActionButton } from "@/components/action-form";

export function SubmitButton({
  children,
  pending: pendingLabel,
  variant = "primary",
  className = "",
  busy,
  disabled = false,
}: {
  children: React.ReactNode;
  pending: string;
  variant?: keyof typeof buttonStyles;
  className?: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = busy ?? formPending;
  return (
    <button type="submit" disabled={pending || disabled} className={`${buttonStyles[variant]} ${className}`} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Açık next korunur; yoksa callback topluluk/başvuru durumuna göre dönüş seçer. */
export function SignInButton({ next, label = "GitHub ile içe aktar", provider = "github" }: { next?: string; label?: string; provider?: "github" | "linkedin_oidc" }) {
  return (
    <ActionForm action={signIn}>
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="provider" value={provider} />
      <ActionButton pending="Girişe yönlendiriliyor…" className={buttonStyles.primary}>
        {provider === "github" && <GithubLogoIcon size={18} weight="fill" />}{label}
      </ActionButton>
    </ActionForm>
  );
}

