const base =
  "press inline-flex h-12 items-center justify-center gap-2.5 rounded-[2px] px-5 text-[0.9375rem] font-medium disabled:cursor-not-allowed disabled:opacity-60";

export const buttonStyles = {
  primary: `${base} bg-indigo-fill text-white hover:bg-indigo-fill-hover`,
  ink: `${base} bg-ink text-wall hover:bg-ink-2`,
  ghost: `${base} border border-rule-strong text-ink hover:border-ink`,
  quiet: "press inline-flex items-center gap-1.5 text-[0.875rem] text-ink-2 hover:text-ink disabled:opacity-60",
};
