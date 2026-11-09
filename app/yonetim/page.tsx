import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { SiteHeader } from "@/components/site-header";
import { AnonymizeForm, NewEventForm, RetryJobButton } from "@/components/admin-forms";
import { Section, SessionNotice } from "@/components/admin-sections";
import { getAdminSession, getEvent, getViewer } from "@/lib/data";
import { eventPath } from "@/lib/event-routes";
import { getEventAccess } from "@/lib/access";
import { can } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDay, formatTime } from "@/lib/format";

export const metadata = { title: "Yönetim" };

/**
 * Platform yönetimi: yeni etkinlik, zamanlayıcı kayıtları ve kişisel veri silme.
 * Etkinliğe ait bölümler `/e/<slug>/yonetim` altındadır. Geçiş döneminde erişim güncel etkinliğe göre denetlenir;
 * Task 5 bu sayfayı yönetim merkezine dönüştürür.
 */
export default async function PlatformAdminPage() {
  await connection();
  const viewer = await getViewer();
  if (!viewer) notFound();
  const event = await getEvent();
  const access = await getEventAccess(viewer, event);
  if (!can(access, "incele")) notFound();
  const manage = can(access, "yonet");
  const anonymize = can(access, "anonimlestir");
  const headAdmin = access?.headAdmin === true;
  const session = await getAdminSession();
  const db = createAdminClient();
  // Zamanlayıcı kayıtları ve bütün etkinliklerin teslim işleri platform geneli: yalnızca head admin.
  const [runsResult, jobsResult] = headAdmin
    ? await Promise.all([
        db.from("worker_runs").select("id, started_at, finished_at, error, processed").order("started_at", { ascending: false }).limit(5),
        db.from("delivery_jobs").select("id, kind, state, attempts, error, next_attempt_at, created_at, project:projects(name, team_name), event:events(title)")
          .order("created_at", { ascending: false }).limit(30),
      ])
    : [{ data: null, error: null }, { data: null, error: null }];
  // Okuma hatası "zamanlayıcı hiç çalışmadı" gibi gösterilmez; sayfa hata ekranına düşer (A09).
  if (runsResult.error) throw new Error(`Zamanlayıcı kayıtları okunamadı: ${runsResult.error.message}`);
  if (jobsResult.error) throw new Error(`Teslim işleri okunamadı: ${jobsResult.error.message}`);
  const runs = runsResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const lastSuccess = runs.find(r => r.finished_at && !r.error);
  const workerStale = !lastSuccess || event.now - +new Date(lastSuccess.finished_at!) > 3 * 60_000;

  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="mx-auto grid w-full max-w-[1240px] flex-1 gap-16 px-5 pt-10 pb-28 sm:px-8 md:pt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">Yönetim</h1>
          <Link href={eventPath(event.slug, "yonetim")} className="inline-flex items-center gap-2 text-[0.9375rem] hover:underline">
            {event.title} yönetimi <ArrowRightIcon size={16} />
          </Link>
        </div>

        {(manage || anonymize) && <SessionNotice session={session} now={event.now} actions="Yeni etkinlik ve veri silme" next="/yonetim" />}

        {headAdmin && (
          <Section title="Zamanlayıcı ve teslim işleri" note="Bütün etkinliklerin tamamlanmamış işleri işlenir. Her iş en fazla 5 kez denenir.">
            <p role="status" className={workerStale ? "text-danger" : "text-ink-2"}>
              {lastSuccess ? `Son başarılı çalışma: ${formatDay(lastSuccess.finished_at!)}, ${formatTime(lastSuccess.finished_at!)}.` : "Henüz başarılı zamanlayıcı çalışması yok."}
              {workerStale && " Dakikalık zamanlayıcıyı kontrol et."}
            </p>
            {runs.filter(r => r.error).map(r => <p key={r.id} className="mt-2 break-all text-sm text-danger">{formatTime(r.started_at)} · {r.error}</p>)}
            <div className="mt-5 max-h-[400px] overflow-auto">
              <ul className="divide-y divide-rule">{jobs.map(j => {
                const p = j.project as unknown as { name: string; team_name: string } | null;
                const ev = j.event as unknown as { title: string } | null;
                return <li key={j.id} className="py-3 text-[0.875rem]">
                  <p className="font-medium">{p?.name ?? "Eser"} · {p?.team_name}</p>
                  <p className="text-ink-3">{ev?.title} · {j.kind === "submit" ? "Teslim" : "Mühür"} · {({ queued: "Sırada", processing: "İşleniyor", completed: "Tamamlandı", failed: "Başarısız" } as Record<string, string>)[j.state]} · {j.attempts}/5 deneme</p>
                  {j.error && <p className="mt-1 break-all text-danger">{j.error}</p>}
                  {j.state === "failed" && <RetryJobButton id={j.id} />}
                  {j.state === "queued" && <p className="text-ink-3">Sonraki deneme: {formatTime(j.next_attempt_at)}</p>}
                </li>;
              })}</ul>
            </div>
          </Section>
        )}

        {manage && event.communityId && (
          <Section title="Yeni etkinlik" note={`${event.communityName ?? "Topluluğun"} için yeni bir etkinlik açar. Mevcut etkinlikler olduğu gibi sürer; birden çok etkinlik aynı anda açık olabilir.`}>
            <NewEventForm communityId={event.communityId} />
          </Section>
        )}

        {anonymize && (
          <Section title="Kişisel veri silme" note="Aydınlatma metnindeki silme başvurusu için. Eser kaydı, commit, arşiv hash'i ve zamanlar korunur; ekip ve oy kayıtlarındaki ad anonimleşir.">
            <AnonymizeForm />
          </Section>
        )}
      </main>
    </>
  );
}
