export type MailJob = { id: string; kind: string; payload: { name?: string; slug?: string; reason?: string }; recipient_email: string; secret_payload: string | null; lease_token: string; attempts: number };
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function renderMail(job: Pick<MailJob, "kind" | "payload">, siteUrl: string, token?: string) {
  const name = job.payload.name ?? "Topluluğun";
  let subject: string, text: string, path = "/topluluk/basvurularim";
  switch (job.kind) {
    case "application_received": subject = "Başvurun alındı · mühür"; text = `${name} için başvurun inceleniyor. Sonucu bu sayfadan takip edebilirsin.`; break;
    case "application_approved": subject = "Topluluğun onaylandı · mühür"; text = `${name} artık onaylı. Topluluk panosundan etkinliklerini yönetebilirsin.`; path = `/topluluk/${encodeURIComponent(job.payload.slug ?? "")}`; break;
    case "application_rejected": subject = "Başvurun incelendi · mühür"; text = `${name} başvurusu onaylanmadı. Gerekçe: ${job.payload.reason ?? "Başvurularım sayfasını kontrol et."} Yeni bilgilerle yeniden başvurabilirsin.`; break;
    case "organizer_invite": case "jury_invite":
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Davet bağlantısı eksik.");
      subject = `${job.kind === "jury_invite" ? "Jüri" : "Organizatör"} daveti · mühür`;
      text = `${name} için ${job.kind === "jury_invite" ? "jüri" : "organizatör"} olarak davetlisin. Bağlantı tek kullanımlık ve 7 gün geçerli. Rolü giriş yaptıktan sonra kendin kabul edersin.`; path = `/katil/${token}`; break;
    default: throw new Error("Bilinmeyen e-posta türü.");
  }
  const url = new URL(path, siteUrl).href;
  return { subject, textContent: `${text}\n\n${url}`, htmlContent: `<div lang="tr"><h1>${escape(subject)}</h1><p>${escape(text)}</p><p><a href="${escape(url)}">Mühür’de aç</a></p></div>` };
}
