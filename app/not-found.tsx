import Link from "next/link";
import { Mascot } from "@/components/mascot/mascot";

export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col items-start justify-center gap-8 px-5 py-24 sm:px-8">
      <Mascot mood="durbun" title="" className="w-40" />
      <div>
        <h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold tracking-[-0.02em]">Bu sayfa mühür defterinde yok.</h1>
        <p className="mt-3 text-[1.0625rem] text-ink-2">
          Maskot dürbünle baktı, bulamadı. Bağlantı eskimiş ya da yanlış olabilir.{" "}
          <Link href="/" className="text-ink underline">
            Ana sayfaya dön
          </Link>
        </p>
      </div>
    </main>
  );
}
