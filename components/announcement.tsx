"use client";

import { useSyncExternalStore } from "react";
import { XIcon } from "@phosphor-icons/react";

const KEY = "duyuru-kapatildi";
const listeners = new Set<() => void>();

function readDismissed() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Sayfaların üstündeki duyuru şeridi. Her yeni duyuru, daha önce kapatılmış olsa bile yeniden görünür. */
export function Announcement({ text, stamp }: { text: string; stamp: string }) {
  const dismissed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readDismissed,
    () => null,
  );
  if (dismissed === stamp) return null;

  return (
    <div role="status" className="bg-indigo-fill text-white">
      <div className="mx-auto flex min-h-10 w-full max-w-[1240px] items-center justify-between gap-4 px-5 py-2 text-[0.9375rem] sm:px-8">
        <p className="text-balance">{text}</p>
        <button
          type="button"
          aria-label="Duyuruyu kapat"
          onClick={() => {
            try {
              localStorage.setItem(KEY, stamp);
            } catch {}
            listeners.forEach((l) => l());
          }}
          className="press grid h-8 w-8 shrink-0 place-items-center rounded-[2px] text-white/80 hover:text-white"
        >
          <XIcon size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
