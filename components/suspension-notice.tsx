import type { EventState } from "@/lib/data";
import { ASKIDA_MESAJI } from "@/lib/authz";

type Suspension = Pick<EventState, "suspended" | "suspendedReason">;

/**
 * Bileşene verilecek askı bilgisi: gerekçe yalnızca görebilecek olana gider. Sunucu bileşeninin
 * prop'ları da (geliştirme modundaki hata ayıklama verisi gibi) sayfaya yazılabildiğinden,
 * gizli gerekçe hiç prop olarak taşınmaz.
 */
export function askiBilgisi(event: EventState, showReason: boolean): Suspension {
  return { suspended: event.suspended, suspendedReason: showReason ? event.suspendedReason : null };
}

/**
 * Platform askısı uyarısı. Askı bir hata değil, bilgi olduğundan `--danger` ve indigo kullanılmaz:
 * `--ink` metin, `--rule-strong` çizgi. Gerekçe yalnızca etkinliği inceleyebilenlere (`incele`) gösterilir.
 */
export function SuspensionNotice({ event, showReason, className = "" }: { event: Suspension; showReason: boolean; className?: string }) {
  if (!event.suspended) return null;
  return (
    <div role="status" className={`border-y border-rule-strong py-4 text-ink ${className}`}>
      <p className="max-w-[70ch] font-medium">{ASKIDA_MESAJI}</p>
      {showReason && event.suspendedReason && (
        <p className="mt-1 max-w-[70ch] text-[0.9375rem] break-words">Gerekçe: {event.suspendedReason}</p>
      )}
    </div>
  );
}
