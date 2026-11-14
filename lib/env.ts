function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`Eksik ortam değişkeni: ${name}`);
  return value;
}

export const env = {
  get communityApplicationsEnabled() { return process.env.COMMUNITY_APPLICATIONS_ENABLED === "true"; },
  get brevoApiKey() { return process.env.BREVO_API_KEY || undefined; },
  get brevoFromEmail() { return process.env.BREVO_FROM_EMAIL || undefined; },
  get brevoFromName() { return process.env.BREVO_FROM_NAME || "mühür"; },
  get brevoWebhookSecret() { return process.env.BREVO_WEBHOOK_SECRET || undefined; },
  get mailPayloadKey() { return process.env.MAIL_PAYLOAD_KEY || undefined; },
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
  get supabaseServiceKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  /** Yalnızca public okuma yetkili bir GitHub token'ı; oran sınırını 60'tan 5000/saate çıkarır. */
  get githubToken() {
    return process.env.GITHUB_TOKEN || undefined;
  },
  get cronSecret() {
    return required("CRON_SECRET", process.env.CRON_SECRET);
  },
  get telegramBotToken() {
    return process.env.TELEGRAM_BOT_TOKEN || undefined;
  },
  get telegramChatId() {
    return process.env.TELEGRAM_CHAT_ID || undefined;
  },
  /** KVKK metnindeki iletişim adresi (kulübün resmi e-postası). */
  get contactEmail() {
    return process.env.CONTACT_EMAIL || undefined;
  },
  get siteUrl() {
    return (
      process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000")
    );
  },
};
