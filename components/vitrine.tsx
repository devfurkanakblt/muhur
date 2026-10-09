"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LOCK_EVENT } from "@/components/clock";
import { ExhibitLabel } from "@/components/exhibit-label";
import { Mascot } from "@/components/mascot/mascot";
import { VoteButton } from "@/components/vote-button";
import type { Exhibit } from "@/lib/data";
import { exhibitNo, formatDateTime } from "@/lib/format";
import { filterGallery } from "@/lib/gallery";

export type VitrineItem = Exhibit & { logo: string | null; href: string; pulse: string | null; own: boolean; awards: { title: string; reason: string }[] };

export type VitrineVoting = {
  state: "kapali" | "acik" | "sonuclandi";
  myVote: string | null;
  tallies: Record<string, number> | null;
  signedIn: boolean;
};

export function Vitrine({
  items,
  locked: lockedInitially,
  sealTime,
  voting,
  live = true,
}: {
  items: VitrineItem[];
  locked: boolean;
  sealTime: string;
  voting: VitrineVoting;
  /** Geçmiş sergilerde kilit olayı dinlenmez. */
  live?: boolean;
}) {
  const [closedLive, setClosedLive] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("no");
  const visibleItems = filterGallery(items, query, sort);
  const closed = lockedInitially || closedLive;

  useEffect(() => {
    if (!live) return;
    const onLock = () => setClosedLive(true);
    window.addEventListener(LOCK_EVENT, onLock);
    return () => window.removeEventListener(LOCK_EVENT, onLock);
  }, [live]);

  const tallies = voting.tallies;
  const best = tallies ? Math.max(0, ...Object.values(tallies)) : 0;
  const winners = tallies && best > 0 ? items.filter((i) => (tallies[i.id] ?? 0) === best) : [];

  const extra = (item: VitrineItem) => {
    if (voting.state === "acik")
      return <VoteButton projectId={item.id} voted={voting.myVote === item.id} own={item.own} signedIn={voting.signedIn} />;
    if (tallies)
      return (
        <p className="text-[0.8125rem] text-ink-2">
          <span className="tnum font-medium text-ink">{tallies[item.id] ?? 0}</span> oy
        </p>
      );
    return null;
  };

  return (
    <section id="vitrin" className="mx-auto w-full max-w-[1240px] px-5 pb-28 sm:px-8">
      {winners.length > 0 && (
        <div className="mb-16 flex flex-col items-start gap-6 border-t border-ink pt-6 sm:flex-row sm:items-center">
          <Mascot mood="kalp" title="" className="w-32 shrink-0" />
          <div>
            <h2 className="text-[1.375rem] font-semibold tracking-[-0.015em]">Halkın seçimi</h2>
            {winners.map((w) => (
              <p key={w.id} className="mt-3 text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em]">
                <Link href={w.href} className="hover:underline">
                  {w.name}
                </Link>
                <span className="font-normal text-ink-2"> · {w.team_name}</span>
              </p>
            ))}
            <p className="mt-2 text-ink-2">
              <span className="tnum">{best}</span> oy · {exhibitNo(winners[0].exhibit_no)}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-ink pt-5">
        <h2 className="text-[1.375rem] font-semibold tracking-[-0.015em]">Vitrin</h2>
        <p className="text-[0.9375rem] text-ink-2">
          <span className="tnum">{items.length}</span> eser
          <span className="mx-2 text-rule-strong">·</span>
          {voting.state === "acik"
            ? "Halkın seçimi oylaması açık, bir oyun var"
            : closed
              ? `Cam kapandı, ${formatDateTime(sealTime)}`
              : "Cam açık, eserler son ana kadar güncellenebilir"}
        </p>
      </div>

      {items.length > 0 && <div className="mt-6 flex flex-wrap items-end gap-4" data-live-safe>
        <div className="grid flex-1 gap-2"><label htmlFor="gallery-search" className="text-[0.875rem] text-ink-2">Proje veya ekip ara</label>
          <input id="gallery-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Proje, ekip veya eser numarası"
            className="h-11 w-full min-w-[180px] border border-rule bg-plinth px-3" />
        </div>
        <div className="grid gap-2"><label htmlFor="gallery-sort" className="text-[0.875rem] text-ink-2">Sıralama</label>
          <select id="gallery-sort" value={sort} onChange={e => setSort(e.target.value)} className="h-11 border border-rule bg-plinth px-3">
            <option value="no">Eser numarası</option><option value="name">Proje adı</option><option value="team">Ekip adı</option>
          </select>
        </div>
        <p role="status" className="py-3 text-[0.875rem] text-ink-3">{visibleItems.length} sonuç</p>
      </div>}
      {items.length > 0 && visibleItems.length === 0 && <p className="py-10 text-ink-2">Bu aramayla eşleşen eser yok.</p>}
      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-6 py-16 sm:flex-row sm:items-center">
          <Mascot mood="merakli" title="" className="w-36 shrink-0" />
          <div>
            <p className="text-[1.125rem] font-medium">Vitrin henüz boş.</p>
            <p className="mt-1 max-w-[42ch] text-ink-2">
              {closed ? "Bu etkinlikte teslim edilen proje olmadı." : "İlk eseri sen yerleştir: GitHub'ı bağla, repoyu seç, dört alanı doldur."}
            </p>
          </div>
        </div>
      ) : (
        <div className="relative -mx-4 mt-6 overflow-hidden px-4 py-6 sm:-mx-6 sm:px-6">
          <ol className="grid grid-cols-1 gap-x-8 gap-y-14 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {visibleItems.map((item) => (
              <li key={item.id}>
                {item.awards.length > 0 && <ul className="mb-3 grid gap-1 text-[0.8125rem] text-indigo">{item.awards.map(a => <li key={a.title} title={a.reason}>★ {a.title}</li>)}</ul>}
                <ExhibitLabel
                  exhibit={item}
                  logo={item.logo}
                  locked={closed}
                  href={item.href}
                  pulse={item.pulse}
                  extra={extra(item)}
                  sealSlot={
                    closedLive && !lockedInitially ? (
                      <p className="seal-line col-start-2 mt-3 font-mono text-[0.75rem] text-indigo">Mühürleniyor…</p>
                    ) : undefined
                  }
                />
              </li>
            ))}
          </ol>
          {/* Cam kapalıyken de altındaki bağlantılar ve oy düğmeleri tıklanabilir (pointer-events: none). */}
          <div aria-hidden data-state={closed ? "closed" : "open"} className="glass absolute inset-0" />
        </div>
      )}
    </section>
  );
}
