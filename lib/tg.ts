// Telegram HTML biçimi (parse_mode: HTML). Sunucu bağımlılığı yok; mesaj kurucuları testte de kullanılır.

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const tg = {
  b: (s: string) => `<b>${escape(s)}</b>`,
  i: (s: string) => `<i>${escape(s)}</i>`,
  code: (s: string) => `<code>${escape(s)}</code>`,
  text: escape,
  link: (href: string, label: string) => `<a href="${escape(href)}">${escape(label)}</a>`,
};
