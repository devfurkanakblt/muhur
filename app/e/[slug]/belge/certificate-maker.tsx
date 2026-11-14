"use client";

import { useState } from "react";
import { DownloadSimpleIcon, PrinterIcon } from "@phosphor-icons/react";
import { buttonStyles } from "@/components/button-styles";
import { cleanNamePart, NAME_PART_MAX } from "@/lib/certificate";

const field =
  "h-12 w-full min-w-0 rounded-[2px] border border-rule-strong bg-plinth px-3 text-[1rem] placeholder:text-ink-3 focus:border-ink focus:outline-none";

type Made = { first: string; last: string; src: string; download: string };

export function CertificateMaker({ slug }: { slug: string }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [made, setMade] = useState<Made | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const a = cleanNamePart(first);
    const b = cleanNamePart(last);
    if (!a || !b) {
      setError("Ad ve soyad yalnızca harf, boşluk, kesme ve tire içerebilir.");
      return;
    }
    setError(null);
    const query = new URLSearchParams({ e: slug, ad: a, soyad: b });
    const src = `/api/belge?${query}`;
    if (made?.src === src) return;
    setState("loading");
    setMade({ first: a, last: b, src, download: `${src}&indir=1` });
  }

  return (
    <div className="mt-10 grid gap-10">
      <form onSubmit={submit} className="no-print grid max-w-[720px] gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="ad" className="text-[0.9375rem] font-medium">Ad</label>
            <input id="ad" required maxLength={NAME_PART_MAX} autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Ayşe" className={field} />
          </div>
          <div className="grid gap-2">
            <label htmlFor="soyad" className="text-[0.9375rem] font-medium">Soyad</label>
            <input id="soyad" required maxLength={NAME_PART_MAX} autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} placeholder="Yılmaz" className={field} />
          </div>
        </div>
        <p className="text-[0.875rem] text-ink-3">Belgede adın tam olarak yazdığın gibi görünür; büyük harfleri ve Türkçe karakterleri kontrol et.</p>
        <div>
          <button type="submit" disabled={state === "loading"} aria-busy={state === "loading"} className={buttonStyles.primary}>
            {state === "loading" ? "Hazırlanıyor…" : made ? "Belgeyi güncelle" : "Belgemi oluştur"}
          </button>
        </div>
        {error && <p role="alert" className="text-danger">{error}</p>}
      </form>

      {made && (
        <section aria-label="Katılım belgesi önizlemesi" className="grid gap-5">
          {/* A4 yatay yazdırma: yalnızca belge, kenar boşluğu yok. */}
          <style>{"@media print { @page { size: A4 landscape; margin: 0; } }"}</style>
          <div role="status" aria-live="polite" className="no-print">
            {state === "loading" && <p className="text-ink-2">Belgen hazırlanıyor…</p>}
            {state === "error" && <p className="text-danger">Belge oluşturulamadı. Biraz sonra yeniden dene.</p>}
            {state === "ready" && <p className="text-ink-2">Belgen hazır, {made.first} {made.last}.</p>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={made.src}
            src={made.src}
            alt={`${made.first} ${made.last} adına katılım belgesi`}
            width={1754}
            height={1240}
            onLoad={() => setState("ready")}
            onError={() => setState("error")}
            className={`h-auto w-full max-w-[1000px] border border-rule print:max-w-none print:border-0 ${state === "ready" ? "" : "opacity-40"}`}
          />
          <div className="no-print flex flex-wrap gap-3">
            <a href={made.download} download className={`${buttonStyles.ink} ${state === "ready" ? "" : "pointer-events-none opacity-60"}`} aria-disabled={state !== "ready"}>
              <DownloadSimpleIcon size={18} /> PNG olarak indir
            </a>
            <button type="button" disabled={state !== "ready"} onClick={() => window.print()} className={buttonStyles.ghost}>
              <PrinterIcon size={18} /> Yazdır ya da PDF olarak kaydet
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
