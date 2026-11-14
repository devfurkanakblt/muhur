"use client";

import { useServerNow } from "@/components/live-state";

const pad = (n: number) => String(n).padStart(2, "0");

/** Liste satırının küçük geri sayımı: "2 gün 03:12:44" ya da "03:12:44". Sıfırda durur. */
export function EventCountdown({ deadline, serverNow }: { deadline: string; serverNow: number }) {
  const now = useServerNow(serverNow);
  const s = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
  const d = Math.floor(s / 86400);
  const clock = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return (
    <span aria-hidden className="tnum whitespace-nowrap font-medium text-indigo" suppressHydrationWarning>
      {d > 0 ? `${d} gün ${clock}` : clock}
    </span>
  );
}
