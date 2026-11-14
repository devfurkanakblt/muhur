"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot, type MascotMood } from "@/components/mascot/mascot";

type Peek = { mood: MascotMood; text: string };

// Yazı alanı dışında klavyeden yazılan sözcükler. "mühür" maskot yerine sayfaya mühür vurur.
const WORDS: Record<string, Peek | "stamp"> = {
  muhur: "stamp",
  mühür: "stamp",
  kahve: { mood: "kahve", text: "Beş dakika kahve, sonra push. Sıra önemli." },
  pizza: { mood: "pizza", text: "Dilim dilim ilerle: küçük commit'ler, sık push'lar." },
};
const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
const KONAMI_PEEK: Peek = { mood: "oyun", text: "↑↑↓↓←→←→BA. Hileyi bildin; teslim süresini uzatmıyor ama." };
const LONGEST = Math.max(KONAMI.length, ...Object.keys(WORDS).map((w) => w.length));

const CONSOLE_ART = String.raw`
   .-~~~-.
  ( o   o )   mühür.
   \  ‿  /    Kaputun altına baktın; demek ki doğru yerdesin.
    '---'     Süre dolar, mühür vurulur. Push'ların erken olsun.
`;

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']"));
}

/**
 * Klavye sürprizleri: Konami kodu, "mühür" / "kahve" / "pizza" yazmak ve konsoldaki selam.
 * Form alanlarında ya da açık bir pencere varken hiçbiri tetiklenmez; sunucuya hiçbir şey gitmez.
 */
export function KeyEggs() {
  const [peek, setPeek] = useState<Peek | null>(null);
  const [stamp, setStamp] = useState(0);
  const keys = useRef<string[]>([]);
  const timers = useRef<{ peek?: ReturnType<typeof setTimeout>; stamp?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => {
    console.log(`%c${CONSOLE_ART}`, "font-family: monospace; color: #8466F3");

    const showPeek = (p: Peek) => {
      setPeek(p);
      clearTimeout(timers.current.peek);
      timers.current.peek = setTimeout(() => setPeek(null), 4200);
    };
    const showStamp = () => {
      setStamp((n) => n + 1);
      clearTimeout(timers.current.stamp);
      timers.current.stamp = setTimeout(() => setStamp(0), 1800);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || typing(e.target) || document.querySelector("dialog[open]")) return;
      const key = e.key.toLocaleLowerCase("tr");
      if (key.length !== 1 && !key.startsWith("arrow")) return;
      const buf = [...keys.current, key].slice(-LONGEST);
      keys.current = buf;

      if (KONAMI.every((k, i) => buf[buf.length - KONAMI.length + i] === k)) {
        keys.current = [];
        showPeek(KONAMI_PEEK);
        return;
      }
      const tail = buf.filter((k) => k.length === 1).join("");
      const hit = Object.keys(WORDS).find((w) => tail.endsWith(w));
      if (!hit) return;
      keys.current = [];
      const egg = WORDS[hit];
      if (egg === "stamp") showStamp();
      else showPeek(egg);
    };

    window.addEventListener("keydown", onKey);
    const t = timers.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t.peek);
      clearTimeout(t.stamp);
    };
  }, []);

  return (
    <>
      <span role="status" className="sr-only">
        {peek?.text ?? (stamp ? "Mühürlendi." : "")}
      </span>
      {stamp > 0 && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-50 grid place-items-center">
          <div key={stamp} className="egg-stamp -rotate-6 border-[6px] border-indigo px-8 py-3 text-indigo">
            <span className="text-[clamp(3rem,12vw,7.5rem)] font-semibold leading-none tracking-[-0.035em]">mühür.</span>
          </div>
        </div>
      )}
      {peek && (
        <div key={peek.mood} aria-hidden className="egg-peek pointer-events-none fixed right-4 bottom-0 z-50 flex items-end gap-2 sm:right-8">
          <p className="mb-16 max-w-[26ch] rounded-[2px] bg-ink px-3.5 py-2.5 text-[0.9375rem] leading-snug text-wall">{peek.text}</p>
          <Mascot mood={peek.mood} title="" className="-mb-3 w-28 sm:w-36" />
        </div>
      )}
    </>
  );
}
