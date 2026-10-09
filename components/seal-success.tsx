"use client";

import { useSyncExternalStore } from "react";
import { Mascot } from "@/components/mascot/mascot";

const listeners = new Set<() => void>();
const inMemorySeen = new Set<string>();
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

export function SealSuccess({ projectId }: { projectId: string }) {
  const key = `muhur-tamamlandi:${projectId}`;
  const seen = useSyncExternalStore(subscribe, () => {
    try { return sessionStorage.getItem(key) === "1" || inMemorySeen.has(key); } catch { return inMemorySeen.has(key); }
  }, () => true);
  if (seen) return null;
  return <div role="status" className="seal-success mt-6 flex items-center gap-4">
    <Mascot mood="mutlu" title="" className="w-20 shrink-0" />
    <div><p className="font-medium">Kodun güvende. Mührün tamamlandı.</p>
      <button type="button" className="mt-2 text-sm text-ink-3 underline underline-offset-4" onClick={() => {
        inMemorySeen.add(key); try { sessionStorage.setItem(key, "1"); } catch {}
        listeners.forEach(cb => cb());
      }}>Anladım</button>
    </div>
  </div>;
}
