export const ARCHIVE_LIMIT_BYTES = 50 * 1024 * 1024;

export function safeDemoUrl(value: string): string | null {
  if (!value.trim()) return null;
  if (value.length > 500) throw new Error("Demo bağlantısı en fazla 500 karakter olabilir.");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Geçerli bir HTTPS demo bağlantısı gir."); }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) {
    throw new Error("Demo bağlantısı HTTPS olmalı ve kullanıcı bilgisi içermemeli.");
  }
  return url.href;
}

export type DeliveryState = "registered" | "processing" | "accepted" | "locked" | "failed" | "sealed";

export function deliveryState(project: {
  accepted_sha?: string | null; archive_sha256?: string | null;
  delivery_error?: string | null; freeze_error?: string | null;
}, locked: boolean, activeJob = false): DeliveryState {
  if (project.archive_sha256) return "sealed";
  if (locked) return project.freeze_error || !project.accepted_sha ? "failed" : "locked";
  if (activeJob) return "processing";
  if (project.delivery_error) return "failed";
  return project.accepted_sha ? "accepted" : "registered";
}

export const DELIVERY_LABELS: Record<DeliveryState, string> = {
  registered: "Kayıtlı · kod teslimi bekleniyor",
  processing: "Teslim sürümü arşivleniyor",
  accepted: "Teslim sürümü kabul edildi",
  locked: "Teslim kilitlendi · mühür tamamlanıyor",
  failed: "Teslimde sorun var",
  sealed: "Arşiv doğrulandı · mühür tamamlandı",
};

/** Saat cihazın duvar saatinden bağımsız, sunucu referansı + monoton geçen süredir. */
export function serverTimeAt(serverNow: number, reference: number, monotonicNow: number) {
  return serverNow + Math.max(0, monotonicNow - reference);
}

export function canDownloadArchive(viewer: { id: string; isAdmin: boolean } | null, memberIds: string[]) {
  return !!viewer && (viewer.isAdmin || memberIds.includes(viewer.id));
}
