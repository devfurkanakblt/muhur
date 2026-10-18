"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DECK, type Entry, type Kind } from "@/lib/deck";
import credits from "@/lib/credits.json";
import { createTiltReader, screenFacing, type Tilt } from "@/lib/tilt";
import { Mascot, type MascotMood } from "@/components/mascot/mascot";

type Phase = "ayar" | "geri-sayim" | "oyun" | "bitti";
type Filter = "hepsi" | Kind;
type Result = { entry: Entry; outcome: Tilt };
type Credit = { author: string; license: string };

const DURATIONS = [60, 90, 120] as const;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "hepsi", label: "Hepsi" },
  { value: "hayvan", label: "Hayvanlar" },
  { value: "bitki", label: "Bitkiler" },
];
const FLASH_MS = 700;
const credit = (id: string) => (credits as Record<string, Credit>)[id];

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Alındaki oyuncu ekranı göremez; sonucu sesten ve titreşimden anlar.
let audio: AudioContext | null = null;
function beep(kind: Tilt | "son") {
  try {
    audio ??= new AudioContext();
    const notes = kind === "dogru" ? [660, 990] : kind === "pas" ? [300] : [520, 390, 260];
    notes.forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      const t = audio!.currentTime + i * 0.12;
      osc.frequency.value = freq;
      osc.type = "triangle";
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch {}
  try {
    navigator.vibrate?.(kind === "dogru" ? 60 : kind === "pas" ? [30, 60, 30] : 300);
  } catch {}
}

/** iOS hareket iznini yalnızca dokunma anında sorar; Android ve masaüstünde izin gerekmez. */
async function askMotion(): Promise<boolean> {
  const Orientation = globalThis.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  if (!Orientation) return false;
  if (typeof Orientation.requestPermission !== "function") return true;
  try {
    return (await Orientation.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Oyun sırasında ekran kararmasın, mümkünse tam ekran ve yatay kalsın. */
async function enterPlayMode(): Promise<() => void> {
  let lock: { release: () => Promise<void> } | null = null;
  try {
    lock = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
  } catch {}
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
  } catch {}
  return () => {
    lock?.release().catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
}

export function Game() {
  const [phase, setPhase] = useState<Phase>("ayar");
  const [filter, setFilter] = useState<Filter>("hepsi");
  const [duration, setDuration] = useState<number>(60);
  const [deck, setDeck] = useState<Entry[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [count, setCount] = useState(3);
  const [left, setLeft] = useState(0);
  const [flash, setFlash] = useState<Tilt | null>(null);
  const [motion, setMotion] = useState<boolean | null>(null);
  const endsAt = useRef(0);
  const exitPlay = useRef<() => void>(() => {});
  const busy = useRef(false);
  // Aynı oturumda sıradaki oyuncu, önceki turlarda çıkmamış canlılarla başlar.
  const seen = useRef(new Set<string>());

  const card = deck[index];
  const score = results.filter((r) => r.outcome === "dogru").length;

  async function start() {
    const granted = await askMotion();
    setMotion(granted);
    exitPlay.current = await enterPlayMode();
    const pool = filter === "hepsi" ? DECK : DECK.filter((e) => e.kind === filter);
    let fresh = pool.filter((e) => !seen.current.has(e.id));
    if (fresh.length < 15) {
      for (const e of pool) seen.current.delete(e.id);
      fresh = pool;
    }
    setDeck([...shuffle(fresh), ...shuffle(pool.filter((e) => !fresh.includes(e)))]);
    setIndex(0);
    setResults([]);
    setFlash(null);
    busy.current = false;
    setCount(3);
    setPhase("geri-sayim");
  }

  const finish = useCallback(() => {
    beep("son");
    exitPlay.current();
    setPhase("bitti");
  }, []);

  const answer = useCallback(
    (outcome: Tilt) => {
      if (phase !== "oyun" || busy.current || !card) return;
      busy.current = true;
      beep(outcome);
      setFlash(outcome);
      seen.current.add(card.id);
      setResults((r) => [...r, { entry: card, outcome }]);
      setTimeout(() => {
        setFlash(null);
        busy.current = false;
        if (index + 1 >= deck.length) finish();
        else setIndex((i) => i + 1);
      }, FLASH_MS);
    },
    [phase, card, index, deck.length, finish],
  );

  // Geri sayım: telefonu alına yerleştirmek için üç saniye.
  useEffect(() => {
    if (phase !== "geri-sayim") return;
    if (count === 0) {
      endsAt.current = Date.now() + duration * 1000;
      setLeft(duration);
      setPhase("oyun");
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count, duration]);

  // Süre sunucu yok; duvar saatine göre sayılır ki sekme yavaşlasa da kaymasın.
  useEffect(() => {
    if (phase !== "oyun") return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        clearInterval(t);
        finish();
      }
    }, 200);
    return () => clearInterval(t);
  }, [phase, finish]);

  // Eğme: ekran yere → doğru, tavana → pas.
  useEffect(() => {
    if (phase !== "oyun") return;
    const read = createTiltReader();
    function onOrient(e: DeviceOrientationEvent) {
      if (e.beta == null || e.gamma == null) return;
      const tilt = read(screenFacing(e.beta, e.gamma));
      if (tilt) answer(tilt);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") answer("dogru");
      else if (e.key === "ArrowUp") answer("pas");
    }
    window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase, answer]);

  // Sıradaki fotoğraflar önceden yüklenir; kart değişince boş ekran görünmez.
  useEffect(() => {
    if (phase !== "oyun" && phase !== "geri-sayim") return;
    for (const e of deck.slice(index, index + 3)) new Image().src = `/kartlar/${e.id}.webp`;
  }, [phase, deck, index]);

  useEffect(() => () => exitPlay.current(), []);

  if (phase === "geri-sayim") {
    return (
      <div className="stage stage-count" role="status">
        <p className="count tnum">{count || ""}</p>
        <p className="count-hint">Telefonu alnına koy, ekran arkadaşlarına dönük olsun.</p>
      </div>
    );
  }

  if (phase === "oyun" && card) {
    const c = credit(card.id);
    return (
      <div className="stage" data-flash={flash ?? undefined}>
        <div className="stage-top">
          <span className={`timer tnum ${left <= 10 ? "timer-late" : ""}`}>{left}</span>
          <span className="tnum stage-score">{score}</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- fotoğraflar zaten boyutlandırılmış WebP */}
        <img key={card.id} className="stage-photo" src={`/kartlar/${card.id}.webp`} alt="" draggable={false} />
        <p className="stage-name">{card.name}</p>
        {c && (
          <p className="stage-credit">
            Foto: {c.author} · {c.license}
          </p>
        )}
        {flash && <p className="stage-flash">{flash === "dogru" ? "Doğru!" : "Pas"}</p>}
        {/* Eğme çalışmazsa: ekranın sol yarısı pas, sağ yarısı doğru. */}
        <button type="button" className="tap tap-pas" onClick={() => answer("pas")} aria-label="Pas" />
        <button type="button" className="tap tap-dogru" onClick={() => answer("dogru")} aria-label="Doğru" />
      </div>
    );
  }

  if (phase === "bitti") {
    const mood: MascotMood = score >= 8 ? "heyecanli" : score >= 4 ? "mutlu" : "fidan";
    return (
      <section className="finale">
        <div className="finale-head">
          <div>
            <p className="label">Süre doldu</p>
            <p className="score-big tnum">
              {score}
              <span className="score-max"> doğru</span>
            </p>
            <p className="lede">
              {score >= 8 ? "Ekip seni çok iyi anlattı, sen de çok iyi dinledin." : score >= 4 ? "Güzel tur! Telefonu sıradaki oyuncuya ver." : "Doğa geniş, süre kısa. Bir tur daha?"}
            </p>
            <div className="actions">
              <button type="button" className="btn btn-primary press" onClick={start}>
                Sıradaki oyuncu
              </button>
              <button type="button" className="btn press" onClick={() => setPhase("ayar")}>
                Ayarlar
              </button>
            </div>
          </div>
          <Mascot key={mood} mood={mood} className="mascot mascot-enter finale-mascot" title="" />
        </div>

        <div className="section-head">
          <h2>Bu tur</h2>
          <span className="muted tnum">
            {score} doğru · {results.length - score} pas
          </span>
        </div>
        <ol className="ledger">
          {results.map((r, i) => (
            <li key={r.entry.id} data-outcome={r.outcome}>
              <span className="mono muted">{String(i + 1).padStart(2, "0")}</span>
              <span className="ledger-name">{r.entry.name}</span>
              <span className="ledger-outcome">{r.outcome === "dogru" ? "Doğru" : "Pas"}</span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section className="intro">
      <div className="intro-copy">
        <h1 className="display">
          Ben kimim<span className="mark">?</span>
        </h1>
        <p className="lede">
          Telefonu alnına tut. Ekranda bir hayvan ya da bitki belirir; sen göremezsin, arkadaşların görür. Onlar anlatır, sen
          bulursun.
        </p>

        <ol className="howto">
          <li>
            <span className="mono muted">01</span>
            <span>
              <strong>Bildin mi?</strong> Ekranı yere doğru eğ.
            </span>
          </li>
          <li>
            <span className="mono muted">02</span>
            <span>
              <strong>Pas mı?</strong> Ekranı tavana doğru eğ.
            </span>
          </li>
          <li>
            <span className="mono muted">03</span>
            <span>Süre bitene kadar olabildiğince çok canlı bul. Anlatanlar canlının adını söyleyemez.</span>
          </li>
        </ol>

        <fieldset className="choice">
          <legend className="label">Deste</legend>
          <div className="segmented">
            {FILTERS.map((f) => (
              <label key={f.value} className="segment press">
                <input type="radio" name="deste" checked={filter === f.value} onChange={() => setFilter(f.value)} />
                <span>{f.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="choice">
          <legend className="label">Süre</legend>
          <div className="segmented">
            {DURATIONS.map((d) => (
              <label key={d} className="segment press">
                <input type="radio" name="sure" checked={duration === d} onChange={() => setDuration(d)} />
                <span className="tnum">{d} sn</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="actions">
          <button type="button" className="btn btn-primary press" onClick={start}>
            Başla
          </button>
          <p className="muted small">Sesi açık tut: doğru ve pas farklı ses çıkarır.</p>
        </div>
        {motion === false && (
          <p className="notice" role="status">
            Eğme hareketine izin verilmedi. Arkadaşların ekrana dokunarak işaretleyebilir: sağ yarı doğru, sol yarı pas.
          </p>
        )}
      </div>
      <div className="intro-mascot">
        <Mascot mood="merakli" className="mascot breathe" title="DEÜ CS&AI maskotu merakla bakıyor" />
      </div>
    </section>
  );
}
