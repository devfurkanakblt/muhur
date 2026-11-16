import { Mascot, type MascotMood } from "@/components/mascot/mascot";

/**
 * DEÜ maskotu yalnız maskotun topluluğunun etkinliklerinde çizilir (`show = eventShowsMascot(event)`); diğer
 * topluluklarda hiçbir şey çizilmez. Etkinlik nesnesi prop olarak taşınmaz (RSC hata ayıklama verisine yazılmasın).
 */
export function EventMascot({ show, mood, className = "" }: { show: boolean; mood: MascotMood; className?: string }) {
  if (!show) return null;
  return <Mascot mood={mood} title="" className={className} />;
}
