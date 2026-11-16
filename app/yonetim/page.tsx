import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { SiteHeader } from "@/components/site-header";
import { AnonymizeForm, NewEventForm } from "@/components/admin-forms";
import { DeliveryJobList, Section, SessionNotice } from "@/components/admin-sections";
import { getAdminSession, getManagementScope, getRequestNow, getViewer, type EventState } from "@/lib/data";
import { eventPath } from "@/lib/event-routes";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDateTime, formatDay, formatTime } from "@/lib/format";
import { ConfirmReadersForm, RetentionToggleForm } from "@/components/retention-admin";

type RetentionReport = { enabled: boolean; gate_open: boolean; readers_confirmed_at: string | null; deleted: number; failed: number; pending: number; blocked_runs: number; oldest_overdue: string | null; last_success: string | null };

export const metadata = { title: "Yönetim" };

/** Etkinliğin merkezdeki durumu: askı (etkinlik ya da topluluk) kilitten önce gelir. */
function durum(e: EventState) {
  if (e.suspended || e.communityStatus === "askida") return "Askıda";
  if (e.locked) return "Mühürlü";
  return e.started ? "Açık" : "Başlamadı";
}

/**
 * Yönetim merkezi: görüntüleyenin yönetebildiği ya da inceleyebildiği etkinlikler, onaylı topluluklarında yeni etkinlik
 * ve (yalnızca head admin) zamanlayıcı kayıtları ile kişisel veri silme. Etkinliğe ait bölümler `/e/<slug>/yonetim` altındadır.
 * Gösterecek bir şeyi olmayan (rolü yok ya da yalnızca onay bekleyen toplulukta) için sayfa yoktur.
 */
export default async function ManagementHub() {
  await connection();
  const viewer = await getViewer();
  if (!viewer) notFound();
  const scope = await getManagementScope(viewer);
  if (!scope.open) notFound();
  const headAdmin = viewer.isHeadAdmin;
  const create = scope.creatable.length > 0;
  const session = await getAdminSession();
  const now = getRequestNow();
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
  // Saklama raporu platform geneli: yalnız head admin. 0020 uygulanmadıysa rapor yerine açıklama gösterilir.
  const retentionResult = headAdmin ? await db.rpc("archive_retention_report") : { data: null, error: null };
  const retention = (retentionResult.data ?? null) as RetentionReport | null;
  const runs = runsResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const lastSuccess = runs.find(r => r.finished_at && !r.error);
  const workerStale = !lastSuccess || now - +new Date(lastSuccess.finished_at!) > 3 * 60_000;
  const actions = create && headAdmin ? "Yeni etkinlik ve veri silme" : create ? "Yeni etkinlik" : "Veri silme";

  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="mx-auto grid w-full max-w-[1240px] flex-1 gap-16 px-5 pt-10 pb-28 sm:px-8 md:pt-16">
        <h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">Yönetim</h1>

        {(create || headAdmin) && <SessionNotice session={session} now={now} actions={actions} next="/yonetim" />}

        <nav aria-label="Topluluk yönetimi" className="flex flex-wrap gap-6">
          <Link className="underline underline-offset-4" href="/topluluk">Topluluklarım</Link>
          {headAdmin && <Link className="underline underline-offset-4" href="/yonetim/topluluklar">Topluluk başvurularını incele</Link>}
          {headAdmin && <Link className="underline underline-offset-4" href="/yonetim/belgeler">Platform belgelerini yönet</Link>}
        </nav>

        <Section
          title="Etkinlikler"
          note={headAdmin
            ? "Bütün toplulukların etkinlikleri. Head admin olarak inceler, askıya alırsın; yönetmek topluluk rolü ister."
            : "Sahibi ya da organizatörü olduğun toplulukların etkinlikleri."}
        >
          {scope.events.length === 0 ? (
            <p className="text-ink-2">Henüz etkinlik yok.</p>
          ) : (
            <ul className="divide-y divide-rule border-y border-rule">
              {scope.events.map((e) => (
                <li key={e.id}>
                  <Link href={eventPath(e.slug, "yonetim")} className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-4">
                    <span className="min-w-0">
                      <span className="block truncate font-medium group-hover:underline">{e.title}</span>
                      <span className="block truncate text-[0.875rem] text-ink-2">
                        {e.communityName ?? "Topluluksuz"} · <span className="font-mono text-[0.8125rem]">{e.slug}</span> · {formatDay(e.startsAt)}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-2 text-[0.9375rem] text-ink-2">
                      {durum(e)} <ArrowRightIcon size={14} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {create && (
          <Section title="Yeni etkinlik" note="Onaylı topluluğun için yeni bir etkinlik açar. Mevcut etkinlikler olduğu gibi sürer; birden çok etkinlik aynı anda açık olabilir.">
            <NewEventForm communities={scope.creatable.map(({ id, name }) => ({ id, name }))} />
          </Section>
        )}

        {headAdmin && (
          <Section title="Zamanlayıcı ve teslim işleri" note="Bütün etkinliklerin tamamlanmamış işleri işlenir. Her iş en fazla 5 kez denenir.">
            <p role="status" className={workerStale ? "text-danger" : "text-ink-2"}>
              {lastSuccess ? `Son başarılı çalışma: ${formatDay(lastSuccess.finished_at!)}, ${formatTime(lastSuccess.finished_at!)}.` : "Henüz başarılı zamanlayıcı çalışması yok."}
              {workerStale && " Dakikalık zamanlayıcıyı kontrol et."}
            </p>
            {runs.filter(r => r.error).map(r => <p key={r.id} className="mt-2 break-all text-sm text-danger">{formatTime(r.started_at)} · {r.error}</p>)}
            <DeliveryJobList jobs={jobs} showEvent />
          </Section>
        )}

        {headAdmin && (
          <Section title="Arşiv saklama (30 gün)" note="Kilitten 30 gün sonra ZIP dosyaları silinir; mühür, SHA-256 ve doğrulama kayıtları kalır. Silme varsayılan kapalıdır ve ayrı onayla açılır.">
            {!retention ? <p className="text-ink-2">Saklama defteri okunamadı (0020 uygulanmamış olabilir).</p> : <>
              <dl className="grid gap-2 text-[0.9375rem] sm:grid-cols-[220px_1fr]">
                <dt className="text-ink-3">Durum</dt><dd className={retention.enabled ? "font-medium" : ""}>{retention.enabled ? "Süreli silme açık" : "Süreli silme kapalı"}{retention.gate_open ? "" : " · aktivasyon kapısı (0021) kapalı"}</dd>
                <dt className="text-ink-3">Okuyucu / kuru koşum onayı</dt><dd>{retention.readers_confirmed_at ? formatDateTime(retention.readers_confirmed_at) : "Yok"}</dd>
                <dt className="text-ink-3">Silinen dosya</dt><dd>{retention.deleted}</dd>
                <dt className="text-ink-3">Başarısız / bekleyen</dt><dd className={retention.failed ? "text-danger" : ""}>{retention.failed} / {retention.pending}{retention.blocked_runs ? ` · ${retention.blocked_runs} iş durduruldu` : ""}</dd>
                <dt className="text-ink-3">En eski vadesi geçmiş iş</dt><dd>{retention.oldest_overdue ? formatDateTime(retention.oldest_overdue) : "Yok"}</dd>
                <dt className="text-ink-3">Son başarılı silme</dt><dd>{retention.last_success ? formatDateTime(retention.last_success) : "Henüz yok"}</dd>
              </dl>
              {!retention.enabled && <div className="mt-6"><ConfirmReadersForm /></div>}
              <div className="mt-6"><RetentionToggleForm enabled={retention.enabled} gateOpen={retention.gate_open} /></div>
            </>}
          </Section>
        )}

        {headAdmin && (
          <Section title="Kişisel veri silme" note="Aydınlatma metnindeki silme başvurusu için. Eser kaydı, commit, arşiv hash'i ve zamanlar korunur; ekip ve oy kayıtlarındaki ad anonimleşir.">
            <AnonymizeForm />
          </Section>
        )}
      </main>
    </>
  );
}
