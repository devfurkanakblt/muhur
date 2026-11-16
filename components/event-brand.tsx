import { Wordmark } from "@/components/brand";
import { accentVariables } from "@/lib/branding";
import type { CSSProperties, ReactNode } from "react";

/** Logo yoksa yer tutucu: adın ilk iki kelimesinin baş harfleri. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join("")
    .toLocaleUpperCase("tr");
}

/** Topluluğun onaylı logosu ya da baş harf yedeği. Görsel süs olarak işaretlenir; ad yanında metinle verilir. */
export function CommunityMark({ name, logoUrl, size = 42, className = "" }: { name: string; logoUrl: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" width={size} height={size} style={style}
        className={`shrink-0 rounded-[2px] border border-rule bg-plinth object-contain ${className}`} />
    );
  }
  return (
    <span aria-hidden style={style}
      className={`grid shrink-0 place-items-center rounded-[2px] border border-rule-strong bg-plinth text-[0.875rem] font-semibold tracking-[0.02em] ${className}`}>
      {initials(name)}
    </span>
  );
}

/** "mühür. ile" imzası: platform kimliği etkinlik renginden etkilenmez (nokta her zaman indigo). */
export function MuhurSignature({ className = "" }: { className?: string }) {
  return (
    <span className={`whitespace-nowrap text-ink-3 ${className}`}>
      <Wordmark /> ile
    </span>
  );
}

/**
 * Etkinlik rengi yalnız bu kapsayıcının içindeki `accent` tokenlarını değiştirir. Kök `--indigo`, mühür/kilit
 * çizgileri ve platform imzası olduğu gibi kalır; başka bir etkinliğin ya da platform sayfasının rengi etkilenmez.
 */
export function EventAccentScope({ color, children, className = "contents" }: { color: string | null; children: ReactNode; className?: string }) {
  return (
    <div data-accent="" style={accentVariables(color) as CSSProperties} className={className}>
      {children}
    </div>
  );
}
