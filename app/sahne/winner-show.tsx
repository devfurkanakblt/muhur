"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { XIcon } from "@phosphor-icons/react";
import { Wordmark } from "@/components/brand";
import { Plinth } from "@/components/exhibit-label";
import { StageQr } from "@/components/stage-qr";
import { AwardBadge, WinnerMembers } from "@/components/winners";
import { exhibitNo } from "@/lib/format";
import type { Winner } from "@/lib/winner-model";
import { nextShowing, type Showing } from "@/lib/winner-show";

/**
 * Sahnedeki kazanan sırası. Sayfa açıldığında var olan kazananlar sessizce gösterilir; sonradan açıklanan
 * her ödül (yönetimden eklenen jüri ödülü, sonuçlanan halkın seçimi) tören akışıyla gelir.
 */
export function useWinnerShow(winners: Winner[]) {
  const ids = winners.map((w) => w.id);
  const key = ids.join(",");
  const [seen, setSeen] = useState(() => new Set(ids));
  const [seenKey, setSeenKey] = useState(key);
  const [queue, setQueue] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);
  const [showing, setShowing] = useState<Showing | null>(() => (ids.length ? { id: ids[0], ceremony: false, since: Date.now(), run: 1 } : null));

  // Yeni kazanan, veri geldiği render'da sıraya girer; kapatılmış gösteri yeniden açılır.
  if (key !== seenKey) {
    setSeenKey(key);
    const fresh = ids.filter((id) => !seen.has(id));
    if (fresh.length) {
      setSeen(new Set([...seen, ...fresh]));
      setQueue((q) => [...q, ...fresh]);
      setHidden(false);
    }
  }

  useEffect(() => {
    const plan = nextShowing(showing, queue, key ? key.split(",") : [], Date.now());
    if (!plan) return;
    const timer = setTimeout(() => {
      setShowing(plan.showing);
      setQueue(plan.queue);
    }, Math.max(0, plan.at - Date.now()));
    return () => clearTimeout(timer);
  }, [showing, queue, key]);

  return {
    showing,
    hidden,
    hide: () => setHidden(true),
    /** Seçilen kazananın törenini yeniden oynatır. */
    replay: (id: string) => {
      setHidden(false);
      setQueue((q) => q.filter((x) => x !== id));
      setShowing((s) => ({ id, ceremony: true, since: Date.now(), run: (s?.run ?? 0) + 1 }));
    },
  };
}

/** Tören akışı (ms): ödül adı → bekleyiş → logo mühür gibi vurulur → eser adı → ekip → üyeler → gerekçe. */
function timeline(ceremony: boolean, members: number) {
  const t = ceremony
    ? { label: 200, title: 450, plinth: 1500, ring: 1880, seal: 2050, name: 2300, team: 2750, member: (i: number) => 3050 + i * 90 }
    : { label: 0, title: 60, plinth: 0, ring: 0, seal: 120, name: 120, team: 180, member: (i: number) => 240 + i * 40 };
  return { ...t, reason: t.member(members) + (ceremony ? 250 : 60) };
}

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

/**
 * Yazı boyutları hem genişliğe hem yüksekliğe bağlı; yine de uzun ad, kalabalık ekip ya da alçak projektörde
 * sütun alana sığmazsa `zoom` ile küçülür. Tören hareketleri transform olduğu için ölçümü etkilemez.
 */
function useFit<T extends HTMLElement>() {
  const area = useRef<HTMLDivElement>(null);
  const content = useRef<T>(null);
  useLayoutEffect(() => {
    const box = area.current;
    const el = content.current;
    if (!box || !el) return;
    const fit = () => {
      el.style.zoom = "1";
      const scale = Math.min(1, box.clientHeight / el.offsetHeight);
      el.style.zoom = scale < 0.995 ? String(Math.floor(scale * 100) / 100) : "";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, []);
  return { area, content };
}

function Spotlight({ winner, ceremony }: { winner: Winner; ceremony: boolean }) {
  const t = timeline(ceremony, winner.members.length);
  const jury = winner.kind === "juri";
  const { area, content } = useFit<HTMLDivElement>();
  // Uzun eser adı dev puntoda dört satıra kırılıyordu; uzunluğa göre kademeli küçülür.
  const nameSize = winner.name.length > 40
    ? "text-[clamp(2rem,min(4.4vw,7vh),5.5rem)]"
    : winner.name.length > 22
      ? "text-[clamp(2.25rem,min(5.4vw,8.5vh),7rem)]"
      : "text-[clamp(2.5rem,min(6.6vw,11vh),8.5rem)]";
  return (
    <div ref={area} className="grid h-full grid-cols-[auto_minmax(0,1fr)] items-center gap-[5vw]">
      <div className="relative w-[min(28vw,46vh)]">
        {ceremony && <div aria-hidden className="w-ring absolute inset-0 border-2 border-ink" style={d(t.ring)} />}
        <div className={ceremony ? "w-stamp" : "w-rise"} style={d(t.plinth)}>
          <Plinth src={winner.logo} alt={`${winner.name} logosu`} />
        </div>
        <span
          className={`${ceremony ? "w-seal" : "w-rise"} absolute -right-[7%] bottom-[9%] -rotate-6 rounded-[2px] bg-blush px-[0.6em] py-[0.2em] font-mono text-[clamp(1rem,1.8vw,2rem)] text-[#0b0d1e] tnum`}
          style={d(t.seal)}
        >
          {exhibitNo(winner.no)}
        </span>
      </div>
      <div ref={content} className="min-w-0">
        <div className="w-rise" style={d(t.label)}><AwardBadge winner={winner} size="lg" /></div>
        <p className="w-mask mt-[2.5vh] text-[clamp(1.5rem,min(3.4vw,5.6vh),4.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink-2">
          <span style={d(t.title)}>{jury ? winner.title : `${winner.votes} oy`}</span>
        </p>
        <h2 className={`w-mask mt-[1.2vh] ${nameSize} font-semibold leading-[0.98] tracking-[-0.045em] [overflow-wrap:anywhere]`}>
          <span style={d(t.name)}>{winner.name}</span>
        </h2>
        <p className="w-rise mt-[1.2vh] text-[clamp(1.125rem,min(2.2vw,3.6vh),2.75rem)] text-ink-2" style={d(t.team)}>{winner.team}</p>
        <div className="mt-[3vh]"><WinnerMembers members={winner.members} size="lg" enter="w-rise" delay={t.member} /></div>
        {winner.reason && (
          <p className="w-rise mt-[3vh] max-w-[56ch] border-l-2 border-ink pl-[1.2vw] text-[clamp(1rem,min(1.6vw,2.7vh),1.875rem)] leading-snug text-ink-2" style={d(t.reason)}>
            {winner.reason}
          </p>
        )}
      </div>
    </div>
  );
}

/** Projektörde tüm sahneyi kaplayan kazanan gösterisi. Alt şeritten her kazanan yeniden oynatılabilir. */
export function WinnerStage({ winners, showing, eventTitle, qrRows, onReplay, onClose }: {
  winners: Winner[];
  showing: Showing;
  eventTitle: string;
  qrRows: string[];
  onReplay: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const winner = winners.find((w) => w.id === showing.id);
  if (!winner) return null;
  return (
    <section aria-label="Kazananlar" className="w-fade fixed inset-0 z-50 flex flex-col overflow-hidden bg-wall px-[4vw] py-[3.5vh] text-ink">
      <header className="flex items-start justify-between gap-6">
        <div>
          <Wordmark className="text-[clamp(1.5rem,2.6vw,3rem)] leading-none" />
          <p className="mt-2 text-[clamp(0.875rem,1.2vw,1.25rem)] text-ink-2">{eventTitle}</p>
        </div>
        <button type="button" onClick={onClose} className="press inline-flex min-h-11 items-center gap-2 text-[1rem] text-ink-2 hover:text-ink">
          <XIcon size={18} /> Sahneye dön
        </button>
      </header>

      <div className="min-h-0 flex-1 py-[3vh]">
        {/* Her gösterimde yeniden kurulur; animasyonlar baştan oynar. */}
        <Spotlight key={`${showing.id}:${showing.run}`} winner={winner} ceremony={showing.ceremony} />
      </div>
      <p className="sr-only" aria-live="polite">
        {showing.ceremony ? `${winner.kind === "juri" ? `Jüri ödülü, ${winner.title}` : "Halkın seçimi"}: ${winner.name}, ${winner.team}.` : ""}
      </p>

      <footer className="flex items-end justify-between gap-[3vw] border-t border-ink pt-[2vh]">
        <ol className="flex min-w-0 flex-wrap gap-x-[2.2vw] gap-y-2 text-[clamp(0.9375rem,1.3vw,1.375rem)]">
          {winners.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => onReplay(w.id)}
                aria-current={w.id === winner.id ? "true" : undefined}
                className="press min-h-11 text-left text-ink-2 underline-offset-[0.25em] hover:text-ink aria-[current=true]:font-semibold aria-[current=true]:text-ink aria-[current=true]:underline"
              >
                {w.kind === "juri" ? w.title : "Halkın seçimi"} · {w.name}
              </button>
            </li>
          ))}
        </ol>
        <div className="flex shrink-0 items-center gap-[1.2vw]">
          <span className="text-right text-[clamp(0.9375rem,1.3vw,1.375rem)] font-semibold">Tara,<br />vitrini gez</span>
          <StageQr rows={qrRows} className="h-[13vh] w-[13vh]" />
        </div>
      </footer>
    </section>
  );
}
