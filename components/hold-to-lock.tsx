"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LockSimpleIcon } from "@phosphor-icons/react";
import { lockNowAction } from "@/app/actions";

const HOLD_MS = 2000;

/**
 * Geri alınamaz işlem: 2 sn basılı tutulur. Basış yavaş ve kasıtlı (linear),
 * bırakış hızlı (200ms ease-out) geri sarar.
 */
export function HoldToLock({ eventId }: { eventId: string }) {
  const [holding, setHolding] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const start = () => {
    if (pending || inFlight.current || timer.current) return;
    setError(null);
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      timer.current = null;
      if (inFlight.current) return;
      inFlight.current = true;
      startTransition(async () => {
        try {
          const result = await lockNowAction(eventId);
          if (result?.error) setError(result.error);
        }
        catch { setError("Mühür işlemi doğrulanamadı. Güncel durumu kontrol edip yeniden dene."); }
        finally { inFlight.current = false; }
      });
    }, HOLD_MS);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  return (
    <><button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onBlur={cancel}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) start(); }
      }}
      onKeyUp={cancel}
      disabled={pending}
      aria-busy={pending}
      className="press relative h-12 select-none overflow-hidden rounded-[2px] border border-indigo px-5 text-[0.9375rem] font-medium text-indigo"
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-indigo-fill"
        style={{
          clipPath: holding || pending ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
          transition: holding ? `clip-path ${HOLD_MS}ms linear` : "clip-path 200ms var(--ease-out)",
        }}
      />
      <span className="relative inline-flex items-center gap-2 mix-blend-normal">
        <LockSimpleIcon size={16} weight="bold" className={holding || pending ? "text-white" : undefined} />
        <span className={holding || pending ? "text-white" : undefined} style={{ transition: "color 200ms ease" }}>
          {pending ? "Mühür vuruluyor…" : holding ? "Bırakma…" : "Mührü vurmak için basılı tut"}
        </span>
      </span>
    </button>{error && <p role="alert" className="mt-3 text-danger">{error}</p>}</>
  );
}
