import "server-only";
export type SendOutcome = { state: "accepted"; messageId: string } | { state: "pending" | "uncertain" | "dead"; error: string; retryAfter?: number };
export async function sendBrevo(input: { id: string; to: string; subject: string; htmlContent: string; textContent: string }, config: { apiKey: string; from: string; fromName: string; timeoutMs?: number }): Promise<SendOutcome> {
  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": config.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender: { email: config.from, name: config.fromName }, to: [{ email: input.to }], subject: input.subject, htmlContent: input.htmlContent, textContent: input.textContent, headers: { IdempotencyKey: input.id }, tags: [`muhur-${input.id}`] }), signal: AbortSignal.timeout(config.timeoutMs ?? 4000) });
  } catch { return { state: "uncertain", error: "Brevo yanıtı alınamadı; göndermeden önce sağlayıcı kaydını kontrol et." }; }
  if (response.status === 429) {
    const value = response.headers.get("retry-after");
    const seconds = value && /^\d+$/.test(value) ? Number(value) : value ? Math.ceil((Date.parse(value) - Date.now()) / 1000) : 60;
    return { state: "pending", error: "Brevo gönderim sınırı; yeniden denenecek.", retryAfter: Number.isFinite(seconds) ? Math.min(86400, Math.max(5, seconds)) : 60 };
  }
  if (response.status >= 500 || response.status === 408) return { state: "uncertain", error: "Brevo gönderimi doğrulanamadı; sağlayıcı kaydını kontrol et." };
  if (!response.ok) return { state: "dead", error: response.status === 401 || response.status === 403 ? "Brevo gönderici veya API yetkisini kontrol et." : "Brevo e-postayı reddetti; alıcı ve gönderici ayarlarını kontrol et." };
  try { const data = await response.json(); if (typeof data.messageId === "string" && data.messageId.length > 0 && data.messageId.length <= 255) return { state: "accepted", messageId: data.messageId }; } catch { /* Başarı yanıtı belirsiz; tekrar gönderme. */ }
  return { state: "uncertain", error: "Brevo mesaj kimliği alınamadı; sağlayıcı kaydını kontrol et." };
}
