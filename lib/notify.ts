import "server-only";
import { env } from "@/lib/env";
import { STICKERS, type StickerId } from "@/lib/stickers";

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Telegram kanalına mesaj gönderir; verilirse önce maskot stikırını sessizce atar. Bot ayarlı değilse geçer; hata akışı bozmaz. */
export async function notify(lines: string[], sticker?: StickerId) {
  const token = env.telegramBotToken;
  const chat = env.telegramChatId;
  if (!token || !chat) return false;
  if (sticker) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendSticker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, sticker: STICKERS[sticker], disable_notification: true }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // Stikır gitmese de mesaj gider.
    }
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.ok === true;
  } catch {
    // Bildirim gitmezse mühür etkilenmez.
    return false;
  }
}

export const tg = {
  b: (s: string) => `<b>${escape(s)}</b>`,
  code: (s: string) => `<code>${escape(s)}</code>`,
  text: escape,
  link: (href: string, label: string) => `<a href="${escape(href)}">${escape(label)}</a>`,
};
