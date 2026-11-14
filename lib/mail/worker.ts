import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { decryptMailSecret } from "@/lib/mail/secrets";
import { renderMail, type MailJob } from "@/lib/mail/templates";
import { sendBrevo, type SendOutcome } from "@/lib/mail/brevo";
export async function runMailWorker(dependencies?: { db?: ReturnType<typeof createAdminClient>; send?: typeof sendBrevo }) {
  const configured = !!(env.brevoApiKey && env.brevoFromEmail && env.mailPayloadKey);
  if (!configured) return { configured: false, processed: 0 };
  const db = dependencies?.db ?? createAdminClient(); const started = Date.now(); let processed = 0;
  while (processed < 3 && Date.now() - started < 9500) {
    const claim = await db.rpc("claim_mail_jobs", { p_limit: 1 });
    if (claim.error) throw new Error("E-posta kuyruğu okunamadı.");
    const job = (claim.data as MailJob[] | null)?.[0]; if (!job) break;
    const ready = await db.rpc("mail_job_ready", { p_job: job.id, p_token: job.lease_token });
    if (ready.error) throw new Error("E-posta işi kontrol edilemedi.");
    if (!ready.data) {
      const finish = await db.rpc("finish_mail_job", { p_job: job.id, p_token: job.lease_token, p_state: "cancelled" });
      if (finish.error || !finish.data) throw new Error("E-posta iptali kaydedilemedi.");
      processed++; continue;
    }
    let outcome: SendOutcome;
    try {
      const token = job.secret_payload ? decryptMailSecret(job.secret_payload).token : undefined;
      const message = renderMail(job, env.siteUrl, token);
      outcome = await (dependencies?.send ?? sendBrevo)({ id: job.id, to: job.recipient_email, ...message }, { apiKey: env.brevoApiKey!, from: env.brevoFromEmail!, fromName: env.brevoFromName, timeoutMs: Math.max(500, Math.min(4000, 10000 - (Date.now() - started))) });
    } catch { outcome = { state: "dead", error: "E-posta hazırlanamadı. Davetse yeni bağlantı oluştur; şifreleme ayarını kontrol et." }; }
    const finish = await db.rpc("finish_mail_job", { p_job: job.id, p_token: job.lease_token, p_state: outcome.state, p_message_id: outcome.state === "accepted" ? outcome.messageId : null, p_error: outcome.state === "accepted" ? null : outcome.error, p_retry_after: outcome.state === "pending" ? Math.max(outcome.retryAfter ?? 60, Math.min(3600, 30 * 2 ** Math.max(0, job.attempts - 1))) : 60 });
    if (finish.error || !finish.data) throw new Error("E-posta sonucu kaydedilemedi; otomatik tekrar gönderilmez.");
    processed++;
  }
  return { configured: true, processed };
}
