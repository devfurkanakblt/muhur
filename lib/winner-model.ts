// Kazananlar: jüri ödülleri ve halkın seçimi. Vitrin, eser sayfası, sahne ve Telegram aynı biçimi kullanır.
import { exhibitNo } from "./format";
import { tg } from "./tg";

export type Winner = {
  /** Jüri ödülünde ödül kimliği; halkın seçiminde `halk-<proje kimliği>`. */
  id: string;
  kind: "juri" | "halk";
  /** Ödül adı; halkın seçiminde "Halkın seçimi". */
  title: string;
  /** Jürinin gerekçesi; halkın seçiminde yok. */
  reason: string | null;
  /** Halkın seçimindeki oy sayısı. */
  votes: number | null;
  projectId: string;
  no: number;
  name: string;
  team: string;
  logo: string | null;
  href: string;
  members: { login: string; avatar: string | null }[];
};

export const PEOPLES_CHOICE = "Halkın seçimi";

export const PEOPLES_CHOICE_PREFIX = "halk-";

export const peoplesChoiceId = (projectId: string) => `${PEOPLES_CHOICE_PREFIX}${projectId}`;

/** Telegram duyurusu. Halkın seçiminde berabere kalan eserler aynı mesajda sıralanır. */
export function winnerAnnouncement(winners: Winner[], siteUrl: string): string[] {
  const [first] = winners;
  if (!first) return [];
  const base = siteUrl.replace(/\/$/, "");
  const head = first.kind === "juri"
    ? `🏆 ${tg.b(`Jüri ödülü: ${first.title}`)}`
    : `❤️ ${tg.b(winners.length > 1 ? `${PEOPLES_CHOICE}: berabere` : PEOPLES_CHOICE)}`;
  return [
    head,
    ...winners.flatMap((w) => [
      "",
      `${tg.b(w.name)} · ${tg.text(w.team)}`,
      ...(w.votes !== null ? [`${w.votes} oy`] : []),
      ...(w.members.length ? [`Ekip: ${tg.text(w.members.map((m) => m.login).join(", "))}`] : []),
      ...(w.reason ? [tg.i(`“${w.reason}”`)] : []),
      tg.link(`${base}${w.href}`, `${exhibitNo(w.no)} · Eseri vitrinde gör`),
    ]),
  ];
}
