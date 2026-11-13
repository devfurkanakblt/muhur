import { createHash, timingSafeEqual } from "node:crypto";
export function validBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function mailEvents(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  if (values.length > 50) throw new Error("Çok fazla olay.");
  const allowed = new Set(["request", "sent", "delivered", "soft_bounce", "hard_bounce", "blocked", "invalid", "error", "deferred", "spam"]);
  return values.flatMap(raw => {
    if (!raw || typeof raw !== "object") throw new Error("Geçersiz olay.");
    const p = raw as Record<string, unknown>;
    if (typeof p.event !== "string" || !allowed.has(p.event)) return [];
    const message = p["message-id"];
    const time = typeof p.ts_epoch === "number" ? p.ts_epoch : typeof p.ts_event === "number" ? p.ts_event * 1000 : typeof p.ts === "number" ? p.ts * 1000 : NaN;
    if (typeof message !== "string" || !message || message.length > 255 || !Number.isFinite(time) || time < 0 || time > Date.now() + 86400_000) throw new Error("Geçersiz olay.");
    const occurred = new Date(time).toISOString();
    const key = createHash("sha256").update(JSON.stringify([message, p.event, occurred, typeof p.email === "string" ? p.email.toLowerCase() : ""])).digest("hex");
    return [{ p_key: key, p_message_id: message, p_event: p.event, p_occurred_at: occurred }];
  });
}
