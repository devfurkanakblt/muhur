"use client";

import { MoonIcon, SunIcon } from "@phosphor-icons/react";

export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const current =
      root.dataset.theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("tema", next);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Temayı değiştir"
      title="Temayı değiştir"
      className="press grid h-9 w-9 place-items-center rounded-[2px] text-ink-2 hover:text-ink"
    >
      <MoonIcon size={18} className="theme-moon" />
      <SunIcon size={18} className="theme-sun" />
    </button>
  );
}
