import type { ReactNode } from "react";
import { EventAccentScope } from "@/components/event-brand";
import { SaveEgg } from "@/components/save-egg";
import { KeyEggs } from "@/components/key-eggs";
import { MysteryEgg } from "@/components/mystery-egg";
import { eventShowsMascot, type EventFeatures } from "@/lib/event-features";
import type { EventState } from "@/lib/data";

type SurfaceProps = { eventId: string; color: string | null; features: EventFeatures; mascot: boolean };

/**
 * Düzenler için yalnız gereken alanlar. Sunucu bileşeninin prop'ları geliştirme modunda RSC hata ayıklama
 * verisine yazılabildiğinden bütün etkinlik nesnesi (askı gerekçesi gibi iç bilgiler) hiç prop olarak taşınmaz.
 */
export function surfaceProps(event: EventState): SurfaceProps {
  return { eventId: event.id, color: event.brand.accentColor, features: event.features, mascot: eventShowsMascot(event) };
}

/**
 * Bir etkinliğin bütün yüzeyleri (/e/<slug> ve /sergi/<slug>): etkinlik rengi yalnız bu kapsamda geçerlidir;
 * klavye sürprizleri ve gizem penceresi yalnız etkinlik bayrağı açıkken monte edilir. Maskot yalnız maskotun
 * topluluğunda görünür. Sunucu eylemleri ve DB aynı bayrakları ayrıca denetler; burada gizlemek yetki değildir.
 */
export function EventSurface({ eventId, color, features, mascot, children }: SurfaceProps & { children: ReactNode }) {
  return (
    <EventAccentScope color={color}>
      {children}
      {features.easter_eggs && <><SaveEgg /><KeyEggs mascot={mascot} /></>}
      {features.mystery_hunt && <MysteryEgg eventId={eventId} mascot={mascot} />}
    </EventAccentScope>
  );
}
