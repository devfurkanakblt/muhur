export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export type CommunityFields = { name: string; slug: string; university: string; city: string; link: string; contact_name: string; contact_email: string; contact_phone: string; previous_application_id: string };
export function httpsLink(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  if (value.length > 2048) throw new Error("Bağlantı en fazla 2048 karakter olabilir.");
  try { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); return url.href; }
  catch { throw new Error("Geçerli bir HTTPS bağlantısı yaz."); }
}
export function communityFields(form: FormData): CommunityFields {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const fields = { name: text("name"), slug: text("slug"), university: text("university"), city: text("city"), link: httpsLink(form.get("link")) ?? "", contact_name: text("contact_name"), contact_email: text("contact_email").toLowerCase(), contact_phone: text("contact_phone"), previous_application_id: text("previous_application_id") };
  if (fields.name.length < 2 || fields.name.length > 80) throw new Error("Topluluk adı 2–80 karakter olmalı.");
  if (!/^[a-z0-9-]{3,40}$/.test(fields.slug)) throw new Error("Adres 3–40 küçük harf, rakam veya tire içermeli.");
  if (fields.contact_name.length < 2 || fields.contact_name.length > 120) throw new Error("Sorumlu kişinin adını ve soyadını yaz.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.contact_email) || fields.contact_email.length > 254) throw new Error("Geçerli bir e-posta adresi yaz.");
  if (fields.contact_phone.length < 3 || fields.contact_phone.length > 32) throw new Error("Telefon 3–32 karakter olmalı; ülke kodunu ekleyebilirsin.");
  if (fields.university.length > 160 || fields.city.length > 80 || (fields.previous_application_id && !UUID.test(fields.previous_application_id))) throw new Error("Kurum, şehir veya önceki başvuru bilgisi geçersiz.");
  return fields;
}
export function communityError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Bu adres veya istek zaten kullanılıyor. Başvurularını kontrol et.";
  if (error.code !== "P0001") return "İşlem tamamlanamadı. Biraz sonra tekrar dene.";
  return error.message.replace(/^(YETKI|ASKIDA|YARISAMAZ|ONAY|OZELLIK|LOCKED):\s*/, "");
}

/** Topluluk marka formu: yalnız genel marka alanları. İletişim, sahip ve durum bu formdan değişmez. */
export function brandingFields(form: FormData): { name: string; university: string | null; city: string | null; link: string | null } {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const fields = { name: text("name"), university: text("university") || null, city: text("city") || null, link: httpsLink(form.get("link")) };
  const control = /[\u0000-\u001f\u007f]/;
  if (fields.name.length < 2 || fields.name.length > 80 || control.test(fields.name)) throw new Error("Topluluk adı 2–80 karakter olmalı.");
  if ((fields.university?.length ?? 0) > 160 || control.test(fields.university ?? "")) throw new Error("Üniversite / kurum en fazla 160 karakter olabilir.");
  if ((fields.city?.length ?? 0) > 80 || control.test(fields.city ?? "")) throw new Error("Şehir en fazla 80 karakter olabilir.");
  return fields;
}
