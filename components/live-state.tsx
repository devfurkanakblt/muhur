"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { serverTimeAt } from "@/lib/delivery-policy";
import { synchronizedTime } from "@/lib/live-policy";
import { formChanges, FORM_SAVED, FORM_PENDING, REFRESH_REQUESTED } from "@/components/protected-form";

const TIME_SYNC = "muhur:time-sync";
type TimeReference = { serverNow: number; reference: number };

export function useServerNow(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    let anchor: TimeReference = { serverNow, reference: performance.now() };
    const tick = () => setNow(serverTimeAt(anchor.serverNow, anchor.reference, performance.now()));
    const sync = (event: Event) => {
      anchor = (event as CustomEvent<TimeReference>).detail;
      tick();
    };
    window.addEventListener(TIME_SYNC, sync);
    const timer = setInterval(tick, 1000);
    tick();
    return () => { clearInterval(timer); window.removeEventListener(TIME_SYNC, sync); };
  }, [serverNow]);
  return now;
}

/** Değişen durumlar yenilenir; kullanıcının yazdığı form asla arka planda ezilmez. */
export function LiveState({ version, fast = false }: { version?: string; fast?: boolean }) {
  const router = useRouter();
  const deferred = useRef(false);
  const [changed, setChanged] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pendingForm, setPendingForm] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let current = version;
    let alive = true;
    let busy = false;
    const controller = new AbortController();
    const refresh = () => {
      formChanges.prune(form => form.isConnected);
      if (formChanges.hasChanges()) {
        deferred.current = true;
        setChanged(true);
        return;
      }
      deferred.current = false;
      setChanged(false);
      router.refresh();
    };
    const markDirty = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.closest("[data-live-safe]")) return;
      const form = target.closest("form");
      if (form) formChanges.edit(form);
    };
    const markSaved = () => { if (deferred.current) refresh(); };
    const markPending = () => setPendingForm(formChanges.hasPending());
    const markReset = (event: Event) => {
      if (event.target instanceof HTMLFormElement) {
        const form = event.target;
        queueMicrotask(() => {
          if (!event.defaultPrevented) { formChanges.discard(form); markSaved(); }
        });
      }
    };
    const pull = async () => {
      if (document.hidden || busy) return;
      busy = true;
      const sent = performance.now();
      try {
        const response = await fetch("/api/durum", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Status unavailable");
        const result = await response.json();
        if (typeof result.version !== "string" || !Number.isFinite(result.now)) throw new Error("Invalid status");
        if (!alive) return;
        setOffline(false);
        window.dispatchEvent(new CustomEvent(TIME_SYNC, {
          detail: synchronizedTime(result.now, sent, performance.now()),
        }));
        if (current === undefined) { current = result.version; refresh(); }
        else if (result.version !== current) {
          current = result.version;
          refresh();
        }
      } catch { if (alive && !controller.signal.aborted) setOffline(true); }
      finally { busy = false; }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      formChanges.prune(form => form.isConnected);
      if (formChanges.hasChanges()) { event.preventDefault(); event.returnValue = ""; }
    };
    document.addEventListener("input", markDirty);
    document.addEventListener("change", markDirty);
    document.addEventListener("reset", markReset);
    document.addEventListener("visibilitychange", pull);
    window.addEventListener("online", pull);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener(FORM_SAVED, markSaved);
    window.addEventListener(FORM_PENDING, markPending);
    window.addEventListener(REFRESH_REQUESTED, refresh);
    const timer = setInterval(pull, fast ? 3000 : 15_000);
    void pull();
    return () => {
      alive = false; controller.abort(); clearInterval(timer);
      document.removeEventListener("input", markDirty);
      document.removeEventListener("change", markDirty);
      document.removeEventListener("reset", markReset);
      document.removeEventListener("visibilitychange", pull);
      window.removeEventListener("online", pull);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener(FORM_SAVED, markSaved);
      window.removeEventListener(FORM_PENDING, markPending);
      window.removeEventListener(REFRESH_REQUESTED, refresh);
    };
  }, [version, fast, router]);
  return <>
    {offline && <p role="status" className="mb-6 border-y border-rule py-3 text-[0.9375rem] text-ink-2">
      Güncel durum alınamadı. Gösterilen bilgiler eski olabilir; bağlantı dönünce tekrar denenecek. Formunu düzenlemeye devam edebilirsin.
    </p>}
    {changed && <div role="status" className="mb-6 border-y border-indigo py-3 text-[0.9375rem]">
      Etkinlik veya teslim durumu değişti. Açık formunu veya devam eden işlemi korumak için sayfa yenilemesi bekletiliyor.{" "}
      <button type="button" disabled={pendingForm} className="min-h-11 underline underline-offset-4 disabled:opacity-60" onClick={() => dialog.current?.showModal()}>{pendingForm ? "İşlem tamamlanması bekleniyor…" : "Güncel durumu göster"}</button>
    </div>}
    <dialog ref={dialog} aria-labelledby="refresh-title" className="m-auto w-[min(92vw,480px)] border border-rule bg-wall p-6 text-ink backdrop:bg-black/40">
      <h2 id="refresh-title" className="text-xl font-semibold">Kaydedilmemiş değişikliklerin var.</h2>
      <p className="mt-3 leading-relaxed text-ink-2">Güncel durumu açmak form alanlarını kaldırabilir. Önce kaydedebilir veya taslağını kopyalayabilirsin. Süre dolduysa yeni değişiklikler teslim edilmez.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => dialog.current?.close()} className="press min-h-12 border border-rule-strong px-4">Düzenlemeye dön</button>
        <button type="button" disabled={pendingForm} onClick={() => {
          if (formChanges.hasPending()) return;
          dialog.current?.close();
          document.querySelectorAll("form").forEach(form => formChanges.discard(form));
          deferred.current = false; setChanged(false); router.refresh();
        }} className="press min-h-12 bg-ink px-4 text-wall">Değişiklikleri bırak ve yenile</button>
      </div>
    </dialog>
  </>;
}
