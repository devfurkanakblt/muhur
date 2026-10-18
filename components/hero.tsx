"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, LOCK_EVENT, useRemaining } from "@/components/clock";
import { Mascot, type MascotMood } from "@/components/mascot/mascot";
import { formatDateTime } from "@/lib/format";
import { greetingAt, moodAt } from "@/lib/daypart";
import type { Activity } from "@/lib/data";

// Maskota tıklayınca sırayla bu ifadeler; birkaç saniye sonra saate göre ifadeye döner.
const PLAY: MascotMood[] = ["mutlu", "kalp", "merakli", "heyecanli", "odakli"];

export function Hero({
  startsAt,
  deadline,
  sealTime,
  locked: lockedInitially,
  serverNow,
  login,
  activity,
  action,
}: {
  startsAt: string;
  deadline: string;
  sealTime: string;
  locked: boolean;
  serverNow: number;
  login: string | null;
  activity: Activity | null;
  action: React.ReactNode;
}) {
  const [lockedLive, setLockedLive] = useState(false);
  const locked = lockedInitially || lockedLive;
  const { remaining, now } = useRemaining(deadline, locked, serverNow);

  useEffect(() => {
    const onLock = () => setLockedLive(true);
    window.addEventListener(LOCK_EVENT, onLock);
    return () => window.removeEventListener(LOCK_EVENT, onLock);
  }, []);

  // Son 10 dakika, duyurulan yemek/oyun ve kilit kendi ifadesini taşır; geri kalan her an Türkiye saatine göre.
  const [play, setPlay] = useState<{ i: number; mood: MascotMood } | null>(null);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (playTimer.current) clearTimeout(playTimer.current);
  }, []);
  const poke = () => {
    const i = play ? (play.i + 1) % PLAY.length : 0;
    setPlay({ i, mood: PLAY[i] });
    if (playTimer.current) clearTimeout(playTimer.current);
    playTimer.current = setTimeout(() => setPlay(null), 2600);
  };

  const startMs = new Date(startsAt).getTime();
  const started = now >= startMs;
  const final = !locked && remaining < 10 * 60 * 1000;
  const phase = locked ? "kilitli" : final ? "son-dakika" : started ? "acik" : "baslamadi";
  const mood: MascotMood = play?.mood ?? (final ? "heyecanli" : activity ? moodAt(now, activity.kind) : locked ? "uykulu" : moodAt(now));
  const greeting = greetingAt(now, login, phase, activity);

  return (
    <section className="relative mx-auto grid w-full max-w-[1240px] grid-cols-1 items-end gap-y-10 px-5 pt-14 pb-16 sm:px-8 md:grid-cols-[1fr_auto] md:pt-24 md:pb-20">
      <div className="min-w-0">
        <h1 className="mb-10 max-w-[24ch] text-[clamp(1.625rem,3.2vw,2.375rem)] font-semibold leading-tight tracking-[-0.025em] text-balance md:mb-14">
          {greeting}
        </h1>
        {locked ? (
          <p className="text-[clamp(3.25rem,10.5vw,6rem)] font-medium leading-none tracking-[-0.03em]">
            Mühürlendi<span className="text-indigo">.</span>
          </p>
        ) : (
          <Clock remaining={started ? remaining : Math.max(0, startMs - now)} />
        )}
        <p className="mt-10 max-w-[38ch] text-[clamp(1.125rem,2vw,1.375rem)] leading-snug tracking-[-0.01em] text-ink-2 text-balance">
          {locked
            ? `Teslimler ${formatDateTime(sealTime)} itibarıyla kapandı. Kabul edilmiş sürümler mühürleniyor; sonraki değişiklikler sayılmaz.`
            : started
              ? `Son teslim ${formatDateTime(deadline)}. Son push'tan sonra panelde teslim sürümünü güncelle; arşivin süre dolmadan kabul edilmiş olmalı.`
              : `Başlangıç ${formatDateTime(startsAt)}, son teslim ${formatDateTime(deadline)}. Repoyu şimdiden içe aktarabilirsin.`}
        </p>
        <div className="mt-8">{action}</div>
      </div>

      <div className="relative mx-auto w-[min(56vw,240px)] md:mx-0 md:-mb-20 md:w-[300px] lg:w-[340px]">
        <div className={locked ? undefined : "breathe"}>
          <button type="button" onClick={poke} aria-label="Maskotu dürt" className="block w-full cursor-pointer rounded-[2px] active:scale-[0.98] transition-transform duration-150">
            <Mascot key={mood} mood={mood} title="" className="mascot-lg mascot-enter block aspect-[1310/1070] h-auto w-full" />
          </button>
        </div>
      </div>
    </section>
  );
}
