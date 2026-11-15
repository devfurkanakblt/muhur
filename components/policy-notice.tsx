import Link from "next/link";

/** Rolü olan kişiye: güncel belge onayı eksik. Zorunluluk açıksa yönetim yazmaları durur; okuma açık kalır. */
export function PolicyNotice({ slug, next, blocking }: { slug: string; next: string; blocking: boolean }) {
  return (
    <div role="status" className="grid max-w-[70ch] gap-3 border-l-2 border-ink pl-4">
      <p className="leading-relaxed">
        {blocking
          ? "Platform belgelerinin yeni sürümü yayınlandı. Onaylayana kadar yönetim işlemleri kapalı; kayıtları inceleyebilirsin."
          : "Platform belgelerinin güncel sürümünü topluluk adına henüz onaylamadın."}
      </p>
      <Link href={`/topluluk/${slug}/onay?next=${encodeURIComponent(next)}`} className="min-h-11 justify-self-start underline underline-offset-4">Belgeleri oku ve onayla</Link>
    </div>
  );
}
