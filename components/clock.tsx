"use client";

import { useEffect, useRef } from "react";
import { useServerNow } from "@/components/live-state";
import { REFRESH_REQUESTED } from "@/components/protected-form";

export const LOCK_EVENT = "vitrin:kilit";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

/** Kalan süreyi saniyede bir günceller; sıfıra ulaştığında kilit olayını yayar. */
export function useRemaining(deadline: string, locked: boolean, serverNow: number) {
  const target = new Date(deadline).getTime();
  const now = useServerNow(serverNow);
  const fired = useRef<string | null>(null);

  useEffect(() => {
    if (locked || now < target || fired.current === deadline) return;
    fired.current = deadline;
    window.dispatchEvent(new Event(LOCK_EVENT));
    window.dispatchEvent(new Event(REFRESH_REQUESTED));
  }, [target, locked, now, deadline]);

  return { remaining: locked ? 0 : Math.max(0, target - now), now };
}

function Digits({ value, label }: { value: number; label: string }) {
  const text = String(value).padStart(2, "0");
  return (
    <span className="flex flex-col items-start">
      <span className="tnum" suppressHydrationWarning>
        {text}
      </span>
      <span className="mt-3 text-[0.6875rem] font-medium tracking-[0.1em] text-ink-3 uppercase">{label}</span>
    </span>
  );
}

export function Clock({ remaining }: { remaining: number }) {
  const p = parts(remaining);
  const showDays = p.d > 0;
  const colon = (
    <span aria-hidden className="mx-[0.06em] -translate-y-[0.06em] text-indigo">
      :
    </span>
  );
  const label = `${p.d} gün ${p.h} saat ${p.m} dakika ${p.s} saniye kaldı`;
  return (
    <div
      role="timer"
      aria-label={label}
      className="flex items-start font-medium leading-none tracking-[-0.03em] text-[clamp(3.25rem,10.5vw,6rem)]"
    >
      {showDays && (
        <>
          <Digits value={p.d} label="gün" />
          {colon}
        </>
      )}
      <Digits value={p.h} label="saat" />
      {colon}
      <Digits value={p.m} label="dakika" />
      {colon}
      <Digits value={p.s} label="saniye" />
    </div>
  );
}
