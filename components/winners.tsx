import Link from "next/link";
import { ArrowRightIcon, HeartIcon } from "@phosphor-icons/react/ssr";
import { Plinth } from "@/components/exhibit-label";
import { exhibitNo } from "@/lib/format";
import type { Winner } from "@/lib/winner-model";

/** Pembe mühür etiketi: "Jüri ödülü" ya da "Halkın seçimi". Kayıt sonrası "No. 007" mührüyle aynı dil. */
export function AwardBadge({ winner, size = "md", className = "" }: { winner: Pick<Winner, "kind">; size?: "md" | "lg"; className?: string }) {
  const scale = size === "lg" ? "gap-[0.5em] px-[0.8em] py-[0.35em] text-[clamp(0.875rem,1.4vw,1.5rem)]" : "gap-1.5 px-2.5 py-1 text-[0.75rem]";
  return (
    <span className={`inline-flex -rotate-2 items-center rounded-[2px] bg-blush font-semibold uppercase tracking-[0.1em] text-[#0b0d1e] ${scale} ${className}`}>
      {winner.kind === "halk" && <HeartIcon weight="fill" className="h-[1.1em] w-[1.1em] text-[#e8536b]" />}
      {winner.kind === "juri" ? "Jüri ödülü" : "Halkın seçimi"}
    </span>
  );
}

/**
 * Ekip üyeleri: GitHub avatarı ve adı. Avatarı olmayan (anonimleştirilmiş) üyede baş harf.
 * Sahnede `enter` ve `delay` ile üyeler sırayla gelir.
 */
export function WinnerMembers({ members, size = "md", enter, delay }: {
  members: Winner["members"]; size?: "md" | "lg"; enter?: string; delay?: (i: number) => number;
}) {
  if (!members.length) return null;
  const avatar = size === "lg" ? "h-[clamp(2rem,min(3.4vw,5.6vh),3.75rem)] w-[clamp(2rem,min(3.4vw,5.6vh),3.75rem)]" : "h-8 w-8";
  return (
    <ul className={`flex flex-wrap ${size === "lg" ? "gap-x-[2.4vw] gap-y-[1.2vh] text-[clamp(1rem,min(1.8vw,3vh),2rem)]" : "gap-x-5 gap-y-2 text-[0.9375rem]"}`}>
      {members.map((m, i) => (
        <li key={m.login} className={`flex items-center gap-2.5 ${enter ?? ""}`} style={delay ? ({ "--d": `${delay(i)}ms` } as React.CSSProperties) : undefined}>
          {m.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.avatar} alt="" className={`${avatar} shrink-0 rounded-full border border-rule bg-plinth`} />
          ) : (
            <span aria-hidden className={`${avatar} grid shrink-0 place-items-center rounded-full border border-rule bg-plinth text-[0.6em] font-semibold uppercase text-ink-2`}>
              {m.login.slice(0, 1)}
            </span>
          )}
          {m.login}
        </li>
      ))}
    </ul>
  );
}

/** Vitrinin başındaki kazananlar: her kazanan kendi kaidesi, mührü, ekibi ve jüri gerekçesiyle. */
export function WinnersSection({ winners }: { winners: Winner[] }) {
  if (!winners.length) return null;
  const jury = winners.filter((w) => w.kind === "juri").length;
  return (
    <section id="kazananlar" aria-labelledby="kazananlar-baslik" className="mb-24 scroll-mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-ink pt-5">
        <h2 id="kazananlar-baslik" className="text-[1.375rem] font-semibold tracking-[-0.015em]">Kazananlar</h2>
        <p className="text-[0.9375rem] text-ink-2">
          {jury > 0 && <><span className="tnum">{jury}</span> jüri ödülü</>}
          {jury > 0 && jury < winners.length && <span className="mx-2 text-rule-strong">·</span>}
          {jury < winners.length && "halkın seçimi"}
        </p>
      </div>
      <ol className="mt-12 grid gap-20">
        {winners.map((w, i) => (
          <li key={w.id} className="grid items-center gap-x-14 gap-y-8 md:grid-cols-[minmax(0,300px)_1fr]">
            <div className="relative mr-6 max-w-[300px] md:mr-0">
              <Plinth src={w.logo} alt={`${w.name} logosu`} />
              <span
                className="w-seal absolute -right-5 bottom-6 -rotate-6 rounded-[2px] bg-blush px-3 py-1 font-mono text-[0.9375rem] text-[#0b0d1e] tnum"
                style={{ "--d": `${300 + i * 150}ms` } as React.CSSProperties}
              >
                {exhibitNo(w.no)}
              </span>
            </div>
            <div className="min-w-0">
              <AwardBadge winner={w} />
              <p className="mt-5 text-[clamp(1.25rem,2.2vw,1.75rem)] font-semibold leading-tight tracking-[-0.02em] text-ink-2">
                {w.kind === "juri" ? w.title : <><span className="tnum">{w.votes}</span> oy</>}
              </p>
              <h3 className="mt-2 text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
                <Link href={w.href} className="hover:underline">{w.name}</Link>
              </h3>
              <p className="mt-2 text-[1.25rem] text-ink-2">{w.team}</p>
              <div className="mt-6"><WinnerMembers members={w.members} /></div>
              {w.reason && (
                <blockquote className="mt-6 max-w-[60ch] border-l border-ink pl-4 text-[1.0625rem] leading-relaxed text-ink-2">
                  {w.reason}
                </blockquote>
              )}
              <Link href={w.href} className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] hover:underline">
                Eseri gör <ArrowRightIcon size={16} />
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Eser sayfasındaki ödül alanı: bu eserin aldığı ödüller, büyük ve gerekçesiyle. */
export function ExhibitAwards({ winners }: { winners: Winner[] }) {
  if (!winners.length) return null;
  return (
    <section aria-label="Ödüller" className="mt-8 grid gap-6 border-y border-ink py-6">
      {winners.map((w) => (
        <div key={w.id}>
          <AwardBadge winner={w} />
          <h2 className="mt-4 text-[clamp(1.5rem,2.8vw,2.125rem)] font-semibold leading-tight tracking-[-0.025em]">
            {w.kind === "juri" ? w.title : <><span className="tnum">{w.votes}</span> oyla halkın seçimi</>}
          </h2>
          {w.reason && <p className="mt-2 max-w-[60ch] leading-relaxed text-ink-2">{w.reason}</p>}
        </div>
      ))}
    </section>
  );
}
