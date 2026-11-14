import "server-only";
import { env } from "@/lib/env";
import type { EventState } from "@/lib/data";
import { STICKERS, type StickerId } from "@/lib/stickers";

export { tg } from "@/lib/tg";

/** Telegram'ın görsel altı metni sınırı; HTML hâli bu sınırı aşıyorsa görsel yerine düz mesaj gider. */
const CAPTION_LIMIT = 1024;

async function call(method: string, body: Record<string, unknown>, timeout = 8000) {
  const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.telegramChatId, ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result.ok === true;
}

/**
 * Telegram kanalına mesaj gönderir; verilirse önce maskot stikırını sessizce atar. Görsel verilirse mesaj
 * görselin altında gider; Telegram görseli alamazsa aynı mesaj düz metin olarak gönderilir.
 * Bot ayarlı değilse geçer; hata akışı bozmaz.
 */
export async function notify(lines: string[], sticker?: StickerId, options: { photo?: string } = {}) {
  if (!env.telegramBotToken || !env.telegramChatId) return false;
  if (sticker) {
    try {
      await call("sendSticker", { sticker: STICKERS[sticker], disable_notification: true });
    } catch {
      // Stikır gitmese de mesaj gider.
    }
  }
  const text = lines.join("\n");
  if (options.photo && text.length <= CAPTION_LIMIT) {
    try {
      // Telegram görseli adresinden kendisi indirir; kart üretimi için süre biraz daha uzun.
      if (await call("sendPhoto", { photo: options.photo, caption: text, parse_mode: "HTML" }, 20_000)) return true;
    } catch {
      // Görsel gitmezse düz mesaja düşülür.
    }
  }
  try {
    return await call("sendMessage", { text, parse_mode: "HTML", disable_web_page_preview: true });
  } catch {
    // Bildirim gitmezse mühür etkilenmez.
    return false;
  }
}

/** Etkinliğin topluluğu Telegram'a izinliyse bildirir; değilse ağa hiç çıkmadan false döner. */
export async function notifyEvent(event: Pick<EventState, "telegram">, lines: string[], sticker?: StickerId, options: { photo?: string } = {}) {
  if (!event.telegram) return false;
  return notify(lines, sticker, options);
}
