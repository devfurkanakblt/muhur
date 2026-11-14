import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key(raw = process.env.MAIL_PAYLOAD_KEY) {
  if (!raw || !/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new Error("E-posta şifreleme anahtarı yapılandırılmadı.");
  const value = Buffer.from(raw, "base64"); if (value.length !== 32) throw new Error("E-posta şifreleme anahtarı geçersiz."); return value;
}
export function encryptMailSecret(value: { token: string }, rawKey?: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
}
export function decryptMailSecret(payload: string, rawKey?: string): { token: string } {
  try {
    if (payload.length > 8192) throw new Error();
    const p = JSON.parse(payload); if (p.v !== 1) throw new Error();
    const iv = Buffer.from(p.iv, "base64"), tag = Buffer.from(p.tag, "base64"); if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", key(rawKey), iv); cipher.setAuthTag(tag);
    const value = JSON.parse(Buffer.concat([cipher.update(Buffer.from(p.data, "base64")), cipher.final()]).toString("utf8"));
    if (!/^[A-Za-z0-9_-]{43}$/.test(value.token)) throw new Error(); return { token: value.token };
  } catch { throw new Error("E-posta bağlantısı çözülemedi; yeni davet oluştur."); }
}
