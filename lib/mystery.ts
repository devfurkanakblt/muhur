// Gizem avcısı: açılış videosundaki "sha256" satırı aslında bir hex metindir. Çözülünce sitede
// Ctrl+Shift+S'ye basıp aşağıdaki cümleyi yazmayı söyler. Bu dosya yalnızca sunucuda içe aktarılır;
// cevap istemci paketine girmez.

const ANSWER = "ekoloji <3 yapay zeka";

/** Yazım farklarını yok sayar: büyük/küçük harf, şapka, fazla boşluk, tırnak, kalp emojisi. */
export function normalizeMystery(input: string) {
  return input
    .normalize("NFC")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/â/g, "a")
    .replace(/(?:❤️|❤|♥️|♥|💜|🩷|💚)/g, "<3")
    .replace(/[“”"'‘’`]/g, "")
    .replace(/\s*<\s*3\s*/g, " <3 ")
    .replace(/\s+/g, " ")
    .replace(/[\s.!]+$/u, "")
    .trim();
}

export function isMysteryAnswer(input: string) {
  if (input.length > 120) return false;
  return normalizeMystery(input) === ANSWER;
}

/** Gizem yalnızca hackathon saatlerinde açık: başlangıçtan mühür anına (erken kilit ya da son tarih) kadar. */
export function mysteryOpen(event: { startsAt: string; sealTime: string; locked: boolean }, now = Date.now()) {
  return !event.locked && now >= new Date(event.startsAt).getTime() && now < new Date(event.sealTime).getTime();
}
