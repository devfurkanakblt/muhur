"use client";

import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { buttonStyles } from "@/components/button-styles";

/**
 * Etkinlik yüzeylerinin 404 ve hata ekranları: hangi topluluğun etkinliği olduğu bilinmeden de güvenli olsun diye
 * maskot içermez (DEÜ maskotu başka topluluğun sayfasına taşmaz). Platform sayfaları kendi maskotlu ekranını kullanır.
 */
export function NeutralNotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col items-start justify-center gap-6 px-5 py-24 sm:px-8">
      <Wordmark className="text-[1.375rem]" />
      <h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold tracking-[-0.02em]">Bu sayfa mühür defterinde yok.</h1>
      <p className="text-[1.0625rem] text-ink-2">
        Bağlantı eskimiş ya da yanlış olabilir.{" "}
        <Link href="/" className="text-ink underline">Ana sayfaya dön</Link>
      </p>
    </main>
  );
}

export function NeutralError({ digest, retry }: { digest?: string; retry: () => void }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col items-start gap-6 px-5 py-16 sm:px-8">
      <Wordmark className="text-[1.375rem]" />
      <h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold tracking-[-0.02em]">Bu ekranı yükleyemedik.</h1>
      <p className="max-w-[56ch] leading-relaxed text-ink-2">Bu hata, projenin veya tesliminin olmadığı anlamına gelmez. Bağlantını kontrol edip yeniden dene; teslim durumunu ekran açıldığında kontrol et.</p>
      <div className="flex flex-wrap items-center gap-5">
        <button type="button" onClick={retry} className={buttonStyles.primary}>Tekrar dene</button>
        <Link href="/" className="inline-flex min-h-11 items-center underline">Ana sayfaya dön</Link>
      </div>
      {digest && <p className="text-[0.875rem] text-ink-3">Destek için hata kodu: <span className="font-mono break-all">{digest}</span></p>}
    </main>
  );
}
