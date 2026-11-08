const TZ = "Europe/Istanbul";

/** Tek bir ad/soyad parçasının en fazla uzunluğu. */
export const NAME_PART_MAX = 40;

const ALLOWED = /^[\p{L}\p{M}][\p{L}\p{M}' .’-]*$/u;

/**
 * Belgeye basılacak ad ya da soyadı temizler: kenar boşlukları atılır, ara boşluklar teke iner.
 * Harf dışında yalnızca boşluk, kesme, nokta ve tire kabul edilir. Geçersizse null.
 */
export function cleanNamePart(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!value || value.length > NAME_PART_MAX || !ALLOWED.test(value)) return null;
  return value;
}

/** Ad ve soyadı birleştirir; ikisi de geçerli değilse null. */
export function certificateName(first: unknown, last: unknown): string | null {
  const a = cleanNamePart(first);
  const b = cleanNamePart(last);
  return a && b ? `${a} ${b}` : null;
}

function parts(iso: string) {
  const out = Object.fromEntries(
    new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return { day: out.day, month: out.month, year: out.year };
}

/** "7–8 Kasım 2026", ay ya da yıl değişiyorsa "31 Ekim – 1 Kasım 2026". Aynı günse tek tarih. */
export function dateRangeTR(startIso: string, endIso: string) {
  const s = parts(startIso);
  const e = parts(endIso);
  const month = (m: string) => m.charAt(0).toLocaleUpperCase("tr-TR") + m.slice(1);
  if (s.year !== e.year) return `${s.day} ${month(s.month)} ${s.year} – ${e.day} ${month(e.month)} ${e.year}`;
  if (s.month !== e.month) return `${s.day} ${month(s.month)} – ${e.day} ${month(e.month)} ${e.year}`;
  if (s.day !== e.day) return `${s.day}–${e.day} ${month(e.month)} ${e.year}`;
  return `${e.day} ${month(e.month)} ${e.year}`;
}

/** İndirilen dosyanın adı için ASCII parça: "Çağrı Öztürk" → "cagri-ozturk". */
export function fileSlug(name: string) {
  return (
    name
      .toLocaleLowerCase("tr-TR")
      .replace(/ı/g, "i")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "katilimci"
  );
}
