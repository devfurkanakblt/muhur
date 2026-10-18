import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowUpRightIcon, DownloadSimpleIcon, MonitorPlayIcon } from "@phosphor-icons/react/ssr";
import { SiteHeader } from "@/components/site-header";
import { ActivityForm, AnnouncementForm, AnonymizeForm, AwardForm, NewEventForm, RetryJobButton, ScheduleForm } from "@/components/admin-forms";
import { HoldToLock } from "@/components/hold-to-lock";
import { exhibitPath, getAdminSession, getEvent, getViewer, getAwards, getEvents, getMysteryHunters, type AdminSession } from "@/lib/data";
import { SignInButton } from "@/components/buttons";
import { selectAll } from "@/lib/paginate";
import { createAdminClient } from "@/lib/supabase/server";
import { HEALTH_TEXT } from "@/lib/health";
import { exhibitNo, formatBytes, formatDateTime, formatDay, formatTime, relativeTR, toLocalInput } from "@/lib/format";
import { retryFreeze, setVoting, removeAward, runWorker } from "@/app/actions";
import { LiveState } from "@/components/live-state";
import { getLiveStatus } from "@/lib/status";
import { ActionForm, ActionButton } from "@/components/action-form";

export const maxDuration = 300;

export const metadata = { title: "Yönetim" };

type Row = {
  id: string;
  exhibit_no: number;
  name: string;
  team_name: string;
  repo_full_name: string;
  repo_url: string;
  repo_created_at: string | null;
  pre_event_commits: boolean | null;
  last_pushed_at: string | null;
  health_issues: string[];
  frozen_sha: string | null;
  frozen_method: string | null;
  archive_path: string | null;
  archive_bytes: number | null;
  freeze_error: string | null;
  accepted_sha: string | null;
  accepted_at: string | null;
  delivery_error: string | null;
  members: { github_login: string }[];
  snapshots: { sha: string; last_seen_at: string }[];
};

type MemberTeam = { user_id: string; project: { team_name: string } | null };

function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-ink pt-6 md:grid-cols-[260px_1fr] md:gap-12">
      <div>
        <h2 className="text-[1.125rem] font-semibold">{title}</h2>
        {note && <p className="mt-2 text-[0.9375rem] text-ink-2">{note}</p>}
      </div>
      <div className="min-w-0 max-w-[680px]">{children}</div>
    </section>
  );
}

/** Geri alınamaz işlemler için oturum tazeliği (A21): süresi dolmadan önce uyarır, dolunca yeniden giriş ister. */
function SessionNotice({ session, now }: { session: AdminSession | null; now: number }) {
  const until = session?.freshUntil ?? null;
  const at = until ? formatDateTime(new Date(until).toISOString()) : null;
  const reauth = <SignInButton next="/yonetim" label="GitHub ile yeniden giriş yap" />;
  if (!session?.fresh) {
    return (
      <div role="alert" className="grid gap-4 border-y border-danger/40 py-5">
        <p className="max-w-[70ch]">
          <span className="font-medium">Kilit, zamanlama, oylama, yeni etkinlik ve veri silme kapalı.</span>{" "}
          <span className="text-ink-2">Bu işlemler son 12 saat içinde açılmış bir oturum ister. Yeniden giriş yapınca hemen açılır.</span>
        </p>
        <div>{reauth}</div>
      </div>
    );
  }
  const soon = until !== null && until - now < 3 * 3600_000;
  return (
    <div className="grid gap-4 text-[0.9375rem] text-ink-2">
      <p>Kilit, zamanlama, oylama, yeni etkinlik ve veri silme {at} itibarıyla yeniden giriş isteyecek.</p>
      {soon && <div><p className="mb-3 text-ink">Süre üç saatten az; kritik bir anda kapanmaması için şimdi yeniden giriş yap.</p>{reauth}</div>}
    </div>
  );
}

export default async function AdminPage() {
  await connection();
  const viewer = await getViewer();
  if (!viewer?.isAdmin) notFound();
  const event = await getEvent();
  const session = await getAdminSession();
  const db = createAdminClient();
  // Okuma hatası "Henüz eser yok" ya da "zamanlayıcı hiç çalışmadı" gibi gösterilmez; sayfa hata ekranına düşer (A09).
  const [rows, votes] = await Promise.all([
    selectAll<Row>((from, to) => db
      .from("projects")
      .select(
        "id, exhibit_no, name, team_name, repo_full_name, repo_url, repo_created_at, pre_event_commits, last_pushed_at, health_issues, frozen_sha, frozen_method, archive_path, archive_bytes, freeze_error, accepted_sha, accepted_at, delivery_error, members:project_members(github_login), snapshots(sha, last_seen_at)",
        { count: "exact" },
      )
      .eq("event_id", event.id)
      .order("exhibit_no")
      .range(from, to)
      .overrideTypes<Row[], { merge: false }>()),
    db.from("votes").select("user_id", { count: "exact", head: true }).eq("event_id", event.id),
  ]);
  if (votes.error) throw new Error(`Oy sayısı okunamadı: ${votes.error.message}`);
  const voteCount = votes.count;
  const sealed = rows.filter((r) => r.archive_path).length;
  const startMs = new Date(event.startsAt).getTime();
  const [awards, events, status, runsResult, jobsResult, hunters, teams] = await Promise.all([
    getAwards(event.id), getEvents(), getLiveStatus(),
    db.from("worker_runs").select("id, started_at, finished_at, error, processed").order("started_at", { ascending: false }).limit(5),
    db.from("delivery_jobs").select("id, kind, state, attempts, error, next_attempt_at, created_at, project:projects(name, team_name), event:events(title)")
      .order("created_at", { ascending: false }).limit(30),
    getMysteryHunters(event.id),
    selectAll<MemberTeam>((from, to) => db
      .from("project_members")
      .select("user_id, project:projects(team_name)", { count: "exact" })
      .eq("event_id", event.id)
      .order("user_id")
      .range(from, to)
      .overrideTypes<MemberTeam[], { merge: false }>()),
  ]);
  if (runsResult.error) throw new Error(`Zamanlayıcı kayıtları okunamadı: ${runsResult.error.message}`);
  if (jobsResult.error) throw new Error(`Teslim işleri okunamadı: ${jobsResult.error.message}`);
  const runs = runsResult.data;
  const jobs = jobsResult.data;
  const teamOf = new Map(teams.map(t => [t.user_id, t.project?.team_name]));
  const lastSuccess = (runs ?? []).find(r => r.finished_at && !r.error);
  const workerStale = !lastSuccess || event.now - +new Date(lastSuccess.finished_at!) > 3 * 60_000;

  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="mx-auto grid w-full max-w-[1240px] flex-1 gap-16 px-5 pt-10 pb-28 sm:px-8 md:pt-16">
        <LiveState version={status.version} fast />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">Yönetim</h1>
            <p className="mt-2 text-ink-2">
              {event.title} · <span className="font-mono text-[0.875rem]">{event.slug}</span>
            </p>
          </div>
          <Link href="/sahne" target="_blank" className="inline-flex items-center gap-2 text-[0.9375rem] hover:underline">
            <MonitorPlayIcon size={18} /> Sahne modunu aç
          </Link>
        </div>

        <SessionNotice session={session} now={event.now} />

        {event.locked ? (
          <Section title="Mühür vuruldu">
            <p className="text-ink-2">
              Mühür anı {formatDay(event.sealTime)}, {formatTime(event.sealTime)}. Kilit kalıcıdır; geri alınamaz ve zamanlama değiştirilemez.
            </p>
          </Section>
        ) : (
          <>
            <Section title="Zamanlama" note="Başlangıçtan önce açılmış repolar ve önceden tarihli commit'ler aşağıdaki tabloda işaretlenir.">
              <ScheduleForm starts={toLocalInput(event.startsAt)} deadline={toLocalInput(event.deadline)} />
            </Section>
            <Section title="Mührü şimdi vur" note={`"Süre doldu" anonsunda kullan. Yeni proje ve değişiklik kabulü anında durur. Geri alınamaz.`}>
              <HoldToLock />
            </Section>
          </>
        )}

        <Section title="Yemek ve etkinlik saati" note="Duyurduğun an ana sayfadaki maskot ve selam değişir; bitirene kadar sürer. Telegram grubuna da gider.">
          <ActivityForm current={event.activity} since={event.activity ? formatTime(event.activity.at).slice(0, 5) : null} />
        </Section>

        <Section title="Duyuru" note="Telegram grubuna da gider.">
          <AnnouncementForm current={event.announcement} />
        </Section>

        <Section
          title="Halkın seçimi"
          note={
            event.locked
              ? `Her GitHub hesabı bir oy; kendi ekibine oy verilemez. Şu ana kadar ${voteCount ?? 0} oy.`
              : "Oylama, mühür vurulduktan sonra açılabilir."
          }
        >
          {event.voting === "kapali" && (
            <ActionForm action={setVoting}>
              <input type="hidden" name="state" value="acik" />
              <ActionButton pending="Oylama açılıyor…"
                disabled={!event.locked}
                className="press inline-flex h-12 items-center rounded-[2px] bg-ink px-5 text-[0.9375rem] font-medium text-wall disabled:opacity-50"
              >
                Oylamayı aç
              </ActionButton>
            </ActionForm>
          )}
          {event.voting === "acik" && (
            <ActionForm action={setVoting}>
              <input type="hidden" name="state" value="sonuclandi" />
              <ActionButton pending="Sonuçlar açıklanıyor…" className="press inline-flex h-12 items-center rounded-[2px] bg-ink px-5 text-[0.9375rem] font-medium text-wall">
                Oylamayı kapat ve sonuçları açıkla
              </ActionButton>
            </ActionForm>
          )}
          {event.voting === "sonuclandi" && <p className="text-ink-2">Sonuçlar vitrinde ve sahnede yayında.</p>}
        </Section>

        <Section title="Zamanlayıcı ve teslim işleri" note="Bütün etkinliklerin tamamlanmamış işleri işlenir. Her iş en fazla 5 kez denenir.">
          <p role="status" className={workerStale ? "text-danger" : "text-ink-2"}>
            {lastSuccess ? `Son başarılı çalışma: ${formatDay(lastSuccess.finished_at!)}, ${formatTime(lastSuccess.finished_at!)}.` : "Henüz başarılı zamanlayıcı çalışması yok."}
            {workerStale && " Dakikalık zamanlayıcıyı kontrol et."}
          </p>
          {(runs ?? []).filter(r => r.error).map(r => <p key={r.id} className="mt-2 break-all text-sm text-danger">{formatTime(r.started_at)} · {r.error}</p>)}
          <ActionForm action={runWorker} className="mt-4"><ActionButton pending="Kuyruk işleniyor…" className="press underline underline-offset-4">Kuyruğu şimdi işle</ActionButton></ActionForm>
          <div className="mt-5 max-h-[400px] overflow-auto">
            <ul className="divide-y divide-rule">{(jobs ?? []).map(j => {
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

        <Section title="Jüri paketi" note="Geçerli teslimler paketi yalnızca mühürlü arşivleri içerir; dışarıda kalanları nedenleriyle listeler. Eksiksiz paket için bütün kayıtların mührü tamamlanmış olmalı.">
          <ul className="grid gap-3">{events.filter(e => e.locked).map(e => <li key={e.id} className="flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem]">
            <span>{e.title}</span><a href={`/api/juri/${e.slug}?paket=gecerli`} className="underline underline-offset-4">Mühürlü teslimler ZIP</a>
            <a href={`/api/juri/${e.slug}?paket=eksiksiz`} className="underline underline-offset-4">Eksiksiz ZIP</a>
            <a href={`/api/juri/${e.slug}?format=csv`} className="underline underline-offset-4">CSV listesi</a>
          </li>)}</ul>
          {!events.some(e => e.locked) && <p className="text-ink-2">İlk etkinlik kilitlendiğinde paket hazır olacak.</p>}
        </Section>

        <Section title="Gizem avcıları" note="Açılış videosundaki gizli mesajı çözüp Ctrl+Shift+S penceresine doğru cümleyi yazanlar. Yalnızca hackathon saatlerinde kaydedilir; rozet takıma verilir.">
          {hunters.length === 0 ? <p className="text-ink-2">Henüz kimse bulamadı.</p> : <>
            <p className="mb-3 text-ink-2">{hunters.length} kişi buldu.</p>
            <ol className="divide-y divide-rule border-y border-rule">{hunters.map(h => <li key={h.user_id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 text-[0.9375rem]">
              <span><span className="font-mono">{h.github_login}</span> · {teamOf.get(h.user_id) ?? <span className="text-ink-3">takımı yok</span>}</span>
              <span className="font-mono text-ink-2">{formatDay(h.found_at)}, {formatTime(h.found_at)}</span>
            </li>)}</ol>
          </>}
        </Section>

        {event.locked && <Section title="Jüri ödülleri" note="Ödül adı ve gerekçesi eserin sergi sayfasında yayımlanır.">
          <AwardForm projects={rows.filter(r => !!r.archive_path)} />
          <ul className="mt-6 divide-y divide-rule">{awards.map(a => <li key={a.id} className="py-3">
            <p className="font-medium">{a.title} · {rows.find(r => r.id === a.project_id)?.name}</p><p className="text-sm text-ink-2">{a.reason}</p>
            <ActionForm action={removeAward}><input type="hidden" name="id" value={a.id} /><ActionButton pending="Kaldırılıyor…" className="mt-2 text-sm text-ink-3 underline">Ödülü kaldır</ActionButton></ActionForm>
          </li>)}</ul>
        </Section>}

        {event.locked && (
          <Section title="Yeni etkinlik" note="Bu sergi geçmiş sergilere taşınır; ana sayfa yeni etkinliği gösterir.">
            <NewEventForm />
          </Section>
        )}

        <Section title="Kişisel veri silme" note="Aydınlatma metnindeki silme başvurusu için. Eser kaydı, commit, arşiv hash'i ve zamanlar korunur; ekip ve oy kayıtlarındaki ad anonimleşir.">
          <AnonymizeForm />
        </Section>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-ink pt-5">
            <h2 className="text-[1.125rem] font-semibold">Eserler</h2>
            <p className="text-[0.9375rem] text-ink-2">
              <span className="tnum">{rows.length}</span> eser
              {event.locked && (
                <>
                  <span className="mx-2 text-rule-strong">·</span>
                  <span className="tnum">{sealed}</span> arşivlendi
                </>
              )}
            </p>
          </div>

          <p id="table-help" className="mt-4 text-[0.875rem] text-ink-3">Diğer sütunları görmek için tabloyu sağa kaydır.</p>
          <div role="region" aria-label="Eserlerin teslim ve mühür durumu" aria-describedby="table-help" tabIndex={0} className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-[0.9375rem]">
              <thead>
                <tr className="border-b border-rule text-[0.6875rem] tracking-[0.1em] text-ink-3 uppercase">
                  <th className="py-3 pr-4 font-medium">No.</th>
                  <th className="py-3 pr-4 font-medium">Eser</th>
                  <th className="py-3 pr-4 font-medium">Repo</th>
                  <th className="py-3 pr-4 font-medium">Durum</th>
                  <th className="py-3 font-medium">Mühür</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-ink-2">
                      Henüz eser yok.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const flags = [
                    ...r.health_issues.map((i) => HEALTH_TEXT[i]?.title ?? i),
                    ...(r.repo_created_at && new Date(r.repo_created_at).getTime() < startMs
                      ? [`Repo başlangıçtan önce açılmış (${formatDay(r.repo_created_at)})`]
                      : []),
                    ...(r.pre_event_commits ? ["Başlangıçtan önce tarihli commit var"] : []),
                  ];
                  const lastSnap = [...r.snapshots].sort((a, b) => +new Date(b.last_seen_at) - +new Date(a.last_seen_at))[0];
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="py-4 pr-4 font-mono text-[0.8125rem] text-ink-3 tnum">{exhibitNo(r.exhibit_no)}</td>
                      <td className="py-4 pr-4">
                        <Link href={exhibitPath(event.slug, r.exhibit_no)} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                        <p className="text-ink-2">{r.team_name}</p>
                        <p className="text-[0.8125rem] text-ink-3">{r.members.map((m) => m.github_login).join(", ")}</p>
                      </td>
                      <td className="py-4 pr-4">
                        <a href={r.repo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[0.8125rem] hover:underline">
                          {r.repo_full_name}
                          <ArrowUpRightIcon size={12} />
                        </a>
                        {r.last_pushed_at && <p className="text-[0.8125rem] text-ink-3">son push {relativeTR(r.last_pushed_at)}</p>}
                      </td>
                      <td className="py-4 pr-4 text-[0.875rem]">
                        {flags.length === 0 ? (
                          <span className="text-ink-3">Sorun yok</span>
                        ) : (
                          <ul className="grid gap-1">
                            {flags.map((f) => (
                              <li key={f} className="text-danger">
                                {f}
                              </li>
                            ))}
                          </ul>
                        )}
                        {lastSnap && (
                          <p className="mt-1 text-[0.8125rem] text-ink-3">
                            ara mühür <span className="font-mono">{lastSnap.sha.slice(0, 7)}</span> · {relativeTR(lastSnap.last_seen_at)}
                          </p>
                        )}
                      </td>
                      <td className="py-4 text-[0.875rem]">
                        {!event.locked ? (
                          <div><span className={r.delivery_error ? "text-danger" : "text-ink-3"}>{r.accepted_sha ? `Kabul edildi · ${r.accepted_sha.slice(0, 7)}` : "Kod teslimi bekleniyor"}</span>
                            {r.delivery_error && <p className="mt-1 text-danger">{r.delivery_error}</p>}
                          </div>
                        ) : r.archive_path ? (
                          <div className="flex flex-col items-start gap-1">
                            <a
                              href={`${r.repo_url}/tree/${r.frozen_sha}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[0.8125rem] text-indigo hover:underline"
                            >
                              {r.frozen_sha?.slice(0, 7)}
                            </a>
                            <a href={`/api/arsiv/${r.id}`} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink">
                              <DownloadSimpleIcon size={14} /> ZIP · {formatBytes(r.archive_bytes ?? 0)}
                            </a>
                            {r.frozen_method === "head" && (
                              <span className="text-[0.8125rem] text-ink-3">Push kaydı okunamadı; kilit anındaki son commit alındı.</span>
                            )}
                            {r.frozen_method === "ara-muhur" && (
                              <span className="text-[0.8125rem] text-ink-3">Repoya ulaşılamadı; son ara mühür esas alındı.</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            {r.frozen_sha && <span className="font-mono text-[0.8125rem] text-indigo">{r.frozen_sha.slice(0, 7)}</span>}
                            <span className={r.freeze_error ? "text-danger" : "text-ink-3"}>{r.freeze_error ?? "Arşivleniyor…"}</span>
                            {r.freeze_error && (
                              <ActionForm action={retryFreeze}>
                                <input type="hidden" name="id" value={r.id} />
                                <ActionButton pending="Sıraya alınıyor…" className="press text-ink-2 underline hover:text-ink">Tekrar dene</ActionButton>
                              </ActionForm>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
