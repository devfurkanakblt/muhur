"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircleIcon, FileZipIcon, XCircleIcon } from "@phosphor-icons/react";
import { lookupSeal, type Match } from "./actions";
import { buttonStyles } from "@/components/button-styles";
import { exhibitNo, formatDateTime } from "@/lib/format";
import { SEAL_VALID_FILE_EXPIRED } from "@/lib/archive-retention";

type Result = { query: string; label: string; matches: Match[] } | null;

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function Verifier() {
  const [result, setResult] = useState<Result>(null);
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const inFlight = useRef(false);

  const run = (query: string, label: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      setError(null);
      setResult(null);
      try {
        setResult({ query, label, matches: await lookupSeal(query) });
      } catch {
        setError("Doğrulama tamamlanamadı. Bağlantını kontrol edip yeniden dene.");
      } finally { inFlight.current = false; }
    });
  };

  const onFile = (file: File | undefined) => {
    if (!file || inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      setError(null);
      setResult(null);
      try {
        const hash = await sha256(file);
        setResult({ query: hash, label: file.name, matches: await lookupSeal(hash) });
      } catch {
        setError("Dosya okunamadı veya doğrulama tamamlanamadı. Arşivi yeniden seçip dene.");
      } finally { inFlight.current = false; }
    });
  };

  return (
    <div className="mt-12 grid max-w-[760px] gap-10">
      <label
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFile(e.dataTransfer.files?.[0]);
        }}
        data-dragging={dragging || undefined}
        className="press flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-rule-strong bg-plinth px-6 text-center transition-[border-color,background-color,transform] duration-150 hover:border-ink data-[dragging]:scale-[0.99] data-[dragging]:border-solid data-[dragging]:border-indigo data-[dragging]:bg-[var(--indigo-wash)]"
      >
        <FileZipIcon size={32} className="text-ink-3" />
        <span className="text-[1rem]">{dragging ? "Bırak" : "Mühürlü arşivi (.zip) buraya bırak ya da seç"}</span>
        <input type="file" disabled={busy} accept=".zip,application/zip" className="sr-only" onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }} />
      </label>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) run(text.trim(), "Commit kodu");
        }}
        className="grid gap-2"
      >
        <label htmlFor="sha" className="text-[0.9375rem] font-medium">
          Ya da commit kodu
        </label>
        <div className="flex gap-3">
          <input
            id="sha"
            required
            pattern="[0-9a-fA-F]{7,40}|[0-9a-fA-F]{64}"
            title="7–40 haneli commit kodu veya 64 haneli SHA-256 özeti gir."
            aria-describedby="sha-help"
            disabled={busy}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="3f9a2c1"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 rounded-[2px] border border-rule-strong bg-plinth px-3 font-mono text-[0.9375rem] placeholder:text-ink-3 focus:border-ink focus:outline-none"
          />
          <button type="submit" disabled={busy} className={buttonStyles.ink}>
            Sorgula
          </button>
        </div>
        <p id="sha-help" className="text-[0.875rem] text-ink-3">7–40 haneli commit kodu veya 64 haneli SHA-256 özeti. Kısa commit kodu birden fazla kayıtla eşleşebilir; kesin karşılaştırma için tam kodu kullan.</p>
      </form>

      {error && <p role="alert" className="text-danger">{error}</p>}
      <div role="status" aria-live="polite" aria-busy={busy}>
        {busy && <p className="text-ink-2">Hesaplanıyor…</p>}
        {!busy && result && (
          <div className="border-t border-ink pt-5">
            <p className="text-[0.8125rem] text-ink-3">
              {result.label} · <span className="font-mono break-all">{result.query}</span>
            </p>
            {result.matches.length === 0 ? (
              <p className="mt-4 flex items-start gap-3 text-[1.0625rem]">
                <XCircleIcon size={24} className="mt-0.5 shrink-0 text-danger" />
                <span>
                  Eşleşen mühür yok. Arşiv değiştirilmiş olabilir ya da bu dosya mühür arşivi değil. GitHub&apos;dan sonradan indirilen ZIP&apos;ler
                  her zaman birebir aynı olmayabilir; doğrulama için panelden indirilen mühürlü arşivi kullan.
                </span>
              </p>
            ) : (
              <ul className="mt-4 grid gap-4">
                {result.matches.map((m) => (
                  <li key={`${m.kind}-${m.href}`} className="flex items-start gap-3">
                    <CheckCircleIcon size={24} weight="fill" className="mt-0.5 shrink-0 text-indigo" />
                    <div>
                      <p className="text-[1.0625rem]">
                        {m.kind === "arsiv" ? "Arşiv birebir eşleşti: " : "Commit kaydı bulundu: "}
                        <Link href={m.href} className="font-semibold hover:underline">
                          {m.name}
                        </Link>{" "}
                        <span className="text-ink-2">· {m.team}</span>
                      </p>
                      <p className="mt-1 text-[0.875rem] text-ink-2">
                        <span className="font-mono tnum">{exhibitNo(m.no)}</span> · {m.event}
                        {m.sealedAt && <> · mühür {formatDateTime(m.sealedAt)}</>}
                      </p>
                      {m.fileExpired && <p className="mt-2 max-w-[60ch] text-[0.875rem] text-ink-2">{SEAL_VALID_FILE_EXPIRED} {m.kind === "arsiv" ? "Eşleşme senin seçtiğin dosyanın özetiyle yapıldı; sunucu dosyayı yeniden indirip doğrulamadı." : ""}</p>}
                      {m.kind === "commit" && <p className="mt-2 max-w-[60ch] text-[0.875rem] text-ink-2">Commit eşleşmesi dosyanın birebir aynı olduğunu doğrulamaz. Bunun için mühürlü ZIP arşivini seç.{!m.sealedAt && " Bu kaydın mühür tamamlanma zamanı yok; tamamlanmış mühür olarak kabul etme."}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
