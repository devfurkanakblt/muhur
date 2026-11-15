import Link from "next/link";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { getViewer } from "@/lib/data";
import { env } from "@/lib/env";

export const metadata = { title: "Aydınlatma metni" };

const sections: { title: string; body: React.ReactNode }[] = [
  {
    title: "Veri sorumlusu",
    body: "Dokuz Eylül Üniversitesi CS&AI öğrenci topluluğu (bundan sonra \"topluluk\"). mühür, topluluğun hackathon etkinliklerinde proje teslimlerini kayıt altına almak için kullandığı sistemdir.",
  },
  {
    title: "İşlenen veriler",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>GitHub ile girişte: GitHub kullanıcı adın, kullanıcı kimliğin, profil fotoğrafı bağlantın ve GitHub hesabındaki e-posta adresin.</li>
        <li>Teslim ettiğin eser: proje adı, ekip adı, kısa özet, logo, repo adı ve bağlantısı, ekip üyelerinin GitHub kullanıcı adları.</li>
        <li>Mühür kaydı: repodaki kodun mühür anındaki kopyası (ZIP), commit kodu ve zaman damgaları. Repo zaten herkese açık olmalıdır.</li>
        <li>Halkın seçimi oylamasına katılırsan hangi esere oy verdiğin. Oylar tek tek yayımlanmaz; yalnızca toplamlar gösterilir.</li>
        <li>Maskot isim etkinliğine katılırsan önerdiğin isim herkese gösterilir. GitHub kullanıcı adın ve hesap kimliğin katılım denetimi için kaydedilir. Verdiğin oy hesap kimliğinle kaydedilir; yalnızca isim başına toplam oy sayısı yayımlanır.</li>
        <li>
          GitHub erişim anahtarın sunucumuzda saklanmaz; yalnızca tarayıcındaki güvenli bir çerezde 12 saat tutulur ve repolarını listelemek için
          kullanılır.
        </li>
      </ul>
    ),
  },
  {
    title: "Amaç ve hukuki sebep",
    body: "Veriler etkinliğe katılımının yürütülmesi, teslimlerin süre sınırına göre kayıt altına alınması, jüri değerlendirmesi ve olası itirazların çözülmesi için işlenir (KVKK m. 5/2-c ve m. 5/2-f). Vitrindeki eser bilgileri ve ekip kullanıcı adları herkese açık sergi kaydının parçasıdır.",
  },
  {
    title: "Aktarım",
    body: "Veriler, sistemin altyapısını sağlayan Supabase (veritabanı ve dosya depolama, Avrupa Birliği / Frankfurt) ve Vercel (barındırma) hizmetlerinde tutulur; bu nedenle yurt dışına aktarılır (KVKK m. 9). Etkinlik bildirimleri için eser adı ve ekip adı topluluğun Telegram grubuna iletilebilir. Veriler bunun dışında üçüncü kişilerle paylaşılmaz.",
  },
  {
    title: "Saklama süresi",
    body: "Mühürlenen eserler ve arşivleri, topluluğun geçmiş sergiler kaydı olarak saklanır. Hesabının ve sana ait kişisel verilerin silinmesini istediğinde, sergi kaydının bütünlüğünü bozmadan (eser kaydı ve mühür korunarak) kişisel bilgilerin kaldırılır ya da anonimleştirilir.",
  },
  {
    title: "Hakların",
    body: "KVKK m. 11 kapsamında verilerinin işlenip işlenmediğini öğrenme, bilgi isteme, düzeltilmesini ya da silinmesini isteme ve itiraz etme haklarına sahipsin. Başvurularını aşağıdaki adrese iletebilirsin.",
  },
];

export default async function PrivacyPage() {
  await connection();
  const viewer = await getViewer();
  const contact = env.contactEmail;
  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1240px] flex-1 px-5 pt-14 pb-28 sm:px-8 md:pt-20">
        <div className="max-w-[68ch]">
          <h1 className="text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]">Aydınlatma metni</h1>
          <p className="mt-4 text-[1.125rem] leading-relaxed text-ink-2">
            6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında, mühür&apos;ü kullanırken hangi verilerinin neden işlendiğini anlatır.
          </p>
          <div className="mt-14 divide-y divide-rule border-y border-ink">
            {sections.map((s) => (
              <section key={s.title} className="grid gap-3 py-7 md:grid-cols-[200px_1fr] md:gap-10">
                <h2 className="text-[0.6875rem] font-medium tracking-[0.1em] text-ink-3 uppercase md:pt-1">{s.title}</h2>
                <div className="leading-relaxed">{s.body}</div>
              </section>
            ))}
            {/* Plan 4: yalnız ne tutulduğunu anlatır; saklama süresi hukuki metin girdisiyle belirlenir. */}
            <section className="grid gap-3 py-7 md:grid-cols-[200px_1fr] md:gap-10">
              <h2 className="text-[0.6875rem] font-medium tracking-[0.1em] text-ink-3 uppercase md:pt-1">Onay kayıtları</h2>
              <p className="leading-relaxed">
                Bir belgeyi ya da etkinlik kuralını onayladığında hangi belgenin hangi sürümünü, hangi topluluk ya da etkinlik için ve ne zaman kabul ettiğin kaydedilir. IP adresi, cihaz bilgisi veya giriş anahtarı bu kayda eklenmez. Kayıt sonradan değiştirilemez; hesabın anonimleştirilirse kayıt ile kimliğin arasındaki bağ kaldırılır.{" "}
                <Link href="/hesabim/onaylar" className="underline">Onay geçmişini görüntüle</Link>.
              </p>
            </section>
            <section className="grid gap-3 py-7 md:grid-cols-[200px_1fr] md:gap-10">
              <h2 className="text-[0.6875rem] font-medium tracking-[0.1em] text-ink-3 uppercase md:pt-1">İletişim</h2>
              <p className="leading-relaxed">
                {contact ? (
                  <a href={`mailto:${contact}`} className="underline">
                    {contact}
                  </a>
                ) : (
                  "Topluluğun resmi iletişim kanalları."
                )}
              </p>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
