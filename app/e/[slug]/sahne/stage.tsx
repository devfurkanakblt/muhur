"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowsOutIcon } from "@phosphor-icons/react";
import { Wordmark } from "@/components/brand";
import { StageQr } from "@/components/stage-qr";
import { exhibitNo, formatDateTime } from "@/lib/format";
import type { StageData } from "@/lib/stage";
import { eventPath } from "@/lib/event-routes";
import { useServerNow } from "@/components/live-state";
import { synchronizedTime } from "@/lib/live-policy";
import { useWinnerShow, WinnerStage } from "./winner-show";

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "az önce";
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  return `${Math.floor(s / 3600)} sa önce`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Projektör için tam ekran sahne: dev geri sayım, push akışı, kilit anında kapanan cam. */
export function Stage({ slug, initial, qrRows, mascot = false }: { slug: string; initial: StageData; qrRows: string[]; mascot?: boolean }) {
  const [data, setData] = useState(initial);
  const now = useServerNow(data.now);
  const [offline, setOffline] = useState(false);
  const fast = new Date(data.deadline).getTime() - data.now < 120_000 && new Date(data.deadline).getTime() - data.now > -60_000;
  const show = useWinnerShow(data.winners);

  // Veriyi düzenli tazele; son dakikada daha sık. Kilitten sonra ödüller açıklanırken sahne birkaç saniyede yakalar.
  useEffect(() => {
    let alive = true;
    let busy = false;
    const controller = new AbortController();
    const pull = async () => {
      if (busy) return;
      busy = true;
      const sent = performance.now();
      try {
        const res = await fetch(`/api/sahne?e=${encodeURIComponent(slug)}`, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error("Stage unavailable");
        const next: StageData = await res.json();
        if (alive) {
          setData({ ...next, now: synchronizedTime(next.now, sent, performance.now()).serverNow });
          setOffline(false);
        }
      } catch { if (alive && !controller.signal.aborted) setOffline(true); }
      finally { busy = false; }
    };
    const id = setInterval(pull, fast ? 3000 : data.locked ? 4000 : 10_000);
    void pull();
    window.addEventListener("online", pull);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(id);
      window.removeEventListener("online", pull);
    };
  }, [slug, data.deadline, data.locked, fast]);

  const start = new Date(data.startsAt).getTime();
  const deadline = new Date(data.deadline).getTime();
  const locked = data.locked || now >= deadline;
  const started = now >= start;
  const target = started ? deadline : start;
  const left = Math.max(0, target - now);
  const s = Math.floor(left / 1000);
  const finalMinute = started && !locked && left <= 60_000;
  const people = data.winners.filter((w) => w.kind === "halk");

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-wall px-[4vw] py-[3.5vh] text-ink">
      <header className="flex items-start justify-between gap-6">
        <div>
          <Wordmark className="text-[clamp(2rem,3.6vw,4rem)] leading-none" />
          <p className="mt-2 text-[clamp(1rem,1.4vw,1.5rem)] text-ink-2">{data.title}</p>
        </div>
        <div className="flex items-start gap-6 text-right">
          <Link href={eventPath(slug)} className="inline-flex min-h-11 items-center text-[1rem] text-ink-2 underline">Vitrini aç</Link>
          <p className="text-[clamp(1rem,1.4vw,1.5rem)] text-ink-2">
            <span className="tnum font-semibold text-ink">{data.count}</span> eser
            {locked && (
              <>
                {" · "}
                <span className="tnum font-semibold text-ink">{data.sealed}</span> mühürlendi
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => document.documentElement.requestFullscreen?.()}
            aria-label="Tam ekran"
            className="press grid h-10 w-10 place-items-center rounded-[2px] text-ink-3 hover:text-ink"
          >
            <ArrowsOutIcon size={22} />
          </button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="relative grid flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-[3vw]">
        <div className="min-w-0">
          {locked ? (
            <p className="text-[clamp(4rem,9.5vw,13rem)] font-semibold leading-[0.9] tracking-[-0.045em]">
              {data.sealed === data.count ? "Mühürlendi" : "Teslim kapandı"}<span className="text-indigo">.</span>
            </p>
          ) : finalMinute ? (
            <p className="tnum text-[clamp(8rem,26vw,30rem)] font-semibold leading-[0.85] tracking-[-0.05em] text-indigo" aria-live="off">
              {s}
            </p>
          ) : (
            <p
              className={`tnum flex items-baseline font-semibold leading-[0.9] tracking-[-0.045em] ${
                s >= 86400 ? "text-[clamp(3rem,7.2vw,10rem)]" : "text-[clamp(4rem,9.8vw,13rem)]"
              }`}
            >
              {s >= 86400 && (
                <>
                  {pad(Math.floor(s / 86400))}
                  <span className="mx-[0.04em] text-indigo">:</span>
                </>
              )}
              {pad(Math.floor((s % 86400) / 3600))}
              <span className="mx-[0.04em] text-indigo">:</span>
              {pad(Math.floor((s % 3600) / 60))}
              <span className="mx-[0.04em] text-indigo">:</span>
              {pad(s % 60)}
            </p>
          )}
          <p className="mt-[3vh] text-[clamp(1.25rem,2.2vw,2.5rem)] text-ink-2">
            {locked
              ? people.length
                ? `Halkın seçimi: ${people.map((w) => `${w.name} · ${w.team}`).join(" / ")} (${people[0].votes} oy)`
                : `${formatDateTime(data.sealTime)} itibarıyla teslim kapandı; ${data.sealed}/${data.count} arşiv doğrulandı.`
              : started
                ? `Son teslim ${formatDateTime(data.deadline)}. Son push'tan sonra teslim sürümünü güncelle.`
                : `Başlangıç ${formatDateTime(data.startsAt)}.`}
          </p>
        </div>
        {/* Masadan okunabilsin diye büyük: ekran yüksekliğinin ~%60'ı. Ortada dürbünlü maskot. */}
        <a href={data.vitrinUrl} className="flex flex-col items-center gap-[1.6vh]">
          <StageQr rows={qrRows} mascot={mascot} className="h-[min(36vw,60vh)] w-[min(36vw,60vh)]" />
          <span className="text-[clamp(1.125rem,1.8vw,2rem)] font-semibold tracking-[-0.01em]">
            {data.voting === "acik" ? "Tara, oy ver" : "Tara, vitrini gez"}
          </span>
        </a>

        {/* Kilit anında cam tüm sahneyi kaplar. */}
        <div aria-hidden data-state={locked ? "closed" : "open"} className="glass pointer-events-none absolute -inset-x-[4vw] -inset-y-[2vh]" />
      </main>

      <footer className="flex min-h-[18vh] items-start justify-between gap-6 border-t border-ink pt-[2vh]">
        <div className="min-w-0 flex-1">
        {offline && <p role="status" className="mb-2 text-[clamp(1rem,1.5vw,1.75rem)] text-danger">Canlı bağlantı kesildi. Gösterilen durum eski olabilir; yeniden bağlanılıyor.</p>}
        {locked && data.winners.length > 0 ? (
          <div className="flex flex-wrap items-baseline gap-x-[2vw] gap-y-2 text-[clamp(1rem,1.5vw,1.75rem)]">
            <span className="font-semibold">Kazananlar</span>
            {data.winners.map((w) => (
              <button key={w.id} type="button" onClick={() => show.replay(w.id)} className="press min-h-11 text-left text-ink-2 underline underline-offset-[0.25em] hover:text-ink">
                {w.kind === "juri" ? w.title : "Halkın seçimi"} · {w.name}
              </button>
            ))}
          </div>
        ) : data.announcement ? (
          <p className="text-[clamp(1.25rem,2vw,2.25rem)] font-medium">{data.announcement}</p>
        ) : data.recent.length > 0 ? (
          <ol className="grid grid-cols-1 gap-x-[3vw] gap-y-2 text-[clamp(1rem,1.5vw,1.75rem)] md:grid-cols-2 xl:grid-cols-3">
            {data.recent.map((r) => (
              <li key={r.no} className="flex min-w-0 items-baseline gap-3">
                <span className="font-mono text-[0.75em] text-ink-3 tnum">{exhibitNo(r.no)}</span>
                <span className="truncate">
                  <span className="font-semibold">{r.team}</span> <span className="text-ink-2">push etti · {ago(r.pushedAt, now)}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[clamp(1rem,1.5vw,1.75rem)] text-ink-2">Vitrin henüz boş. İlk eser seni bekliyor.</p>
        )}
        </div>
      </footer>

      {locked && show.showing && !show.hidden && (
        <WinnerStage winners={data.winners} showing={show.showing} eventTitle={data.title} qrRows={qrRows} onReplay={show.replay} onClose={show.hide} />
      )}
    </div>
  );
}
