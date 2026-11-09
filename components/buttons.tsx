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

export function SignInButton({ next = "/panel", label = "GitHub ile içe aktar" }: { next?: string; label?: string }) {
  return (
    <ActionForm action={signIn}>
      <input type="hidden" name="next" value={next} />
      <ActionButton pending="GitHub'a yönlendiriliyor…" className={buttonStyles.primary}>
        <GithubLogoIcon size={18} weight="fill" />{label}
      </ActionButton>
    </ActionForm>
  );
}

