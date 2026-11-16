import { NeutralNotFound } from "@/components/neutral-pages";

/**
 * Kök 404. Bu şablon her sayfanın RSC verisine (görünmez de olsa) eklendiğinden maskot içermez: DEÜ maskotu
 * başka topluluğun etkinlik sayfasının HTML çıktısına girmesin (Plan 5).
 */
export default function NotFound() {
  return <NeutralNotFound />;
}
