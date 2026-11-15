import { JuryManagement } from "@/components/jury-management";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowUpRightIcon, DownloadSimpleIcon, MonitorPlayIcon } from "@phosphor-icons/react/ssr";
import { SiteHeader } from "@/components/site-header";
import { ActivityForm, AnnouncementForm, AwardForm, EventTermsForm, ScheduleForm, SuspendForm } from "@/components/admin-forms";
import { PolicyNotice } from "@/components/policy-notice";
import { getManagementConsent } from "@/lib/policy-data";
import { DeliveryJobList, Section, SessionNotice } from "@/components/admin-sections";
import { SuspensionNotice } from "@/components/suspension-notice";
import { HoldToLock } from "@/components/hold-to-lock";
import { exhibitPath, getAdminSession, getViewer, getAwards, getMysteryHunters, requireEventBySlug } from "@/lib/data";
import { eventPath } from "@/lib/event-routes";
import { getEventAccess } from "@/lib/access";
import { can } from "@/lib/authz";
import { selectAll } from "@/lib/paginate";
import { createAdminClient } from "@/lib/supabase/server";
import { HEALTH_TEXT } from "@/lib/health";
import { exhibitNo, formatBytes, formatDay, formatTime, relativeTR, toLocalInput } from "@/lib/format";
import { retryFreeze, setVoting, removeAward, runWorker } from "@/app/actions";
import { LiveState } from "@/components/live-state";
import { getLiveStatus } from "@/lib/status";
import { ActionForm, ActionButton } from "@/components/action-form";

export const maxDuration = 300;

export async function generateMetadata({ params }: PageProps<"/e/[slug]/yonetim">) {
  const { slug } = await params;
  const event = await requireEventBySlug(slug);
  return { title: { absolute: `${event.title} · mühür` } };
}

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

/** Etkinlik yönetimi: zamanlar, duyuru, kilit, oylama, ödüller, teslim işleri, jüri paketi ve askı. */
export default async function EventAdminPage({ params }: PageProps<"/e/[slug]/yonetim">) {
  await connection();
  const { slug } = await params;
  const [viewer, event] = await Promise.all([getViewer(), requireEventBySlug(slug)]);
  if (!viewer) notFound();
  // Sayfa etkinlik kapsamındadır: inceleyemeyen için yoktur; yönetemeyen (head admin ya da askıdaki etkinlik) salt okur.
  const access = await getEventAccess(viewer, event);
  if (!can(access, "incele")) notFound();
  const manage = can(access, "yonet");
  // Rolü olan kişiye güncel belge onayı eksikse onay ekranına giden uyarı gösterilir (rol bilgisi başkasına açılmaz).
  const consent = access?.communityRole && event.communityId ? await getManagementConsent(viewer.id, event.communityId) : null;
  const platform = can(access, "askiya-al");
  const session = await getAdminSession();
  const termsResult = await createAdminClient().from("events").select("terms:event_terms_versions!events_current_terms_own(id,version,rules_url,privacy_url,content_sha256)").eq("id", event.id).maybeSingle();
  if (termsResult.error) throw new Error(`Etkinlik kuralları okunamadı: ${termsResult.error.message}`);
  const rawTerms = termsResult.data?.terms as unknown as { id: string; version: number; rules_url: string; privacy_url: string; content_sha256: string | null } | null;
  const terms = rawTerms ? { id: rawTerms.id, version: rawTerms.version, rulesUrl: rawTerms.rules_url, privacyUrl: rawTerms.privacy_url, contentSha256: rawTerms.content_sha256 } : null;
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
  // Teslim işleri yalnızca bu etkinliğinkidir; zamanlayıcı kayıtları platform genelidir ve /yonetim'dedir.
  const [awards, status, jobsResult, hunters, teams] = await Promise.all([
    getAwards(event.id), getLiveStatus(event),
    db.from("delivery_jobs").select("id, kind, state, attempts, error, next_attempt_at, created_at, project:projects(name, team_name)")
      .eq("event_id", event.id).order("created_at", { ascending: false }).limit(30),
    getMysteryHunters(event.id),
    selectAll<MemberTeam>((from, to) => db
      .from("project_members")
      .select("user_id, project:projects(team_name)", { count: "exact" })
      .eq("event_id", event.id)
      .order("user_id")
      .range(from, to)
      .overrideTypes<MemberTeam[], { merge: false }>()),
  ]);
  if (jobsResult.error) throw new Error(`Teslim işleri okunamadı: ${jobsResult.error.message}`);
  // Jüri paketi bu etkinlik kilitlendiyse ve görüntüleyen indirebiliyorsa sunulur.
  const juryReady = event.locked && can(access, "juri-paketi");
  const jobs = jobsResult.data;
  const teamOf = new Map(teams.map(t => [t.user_id, t.project?.team_name]));

  return (
    <>
      <SiteHeader viewer={viewer} event={event} />
      <main id="main-content" tabIndex={-1} className="mx-auto grid w-full max-w-[1240px] flex-1 gap-16 px-5 pt-10 pb-28 sm:px-8 md:pt-16">
        <LiveState slug={event.slug} version={status.version} fast />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">Yönetim</h1>
            <p className="mt-2 text-ink-2">
              {event.title} · <span className="font-mono text-[0.875rem]">{event.slug}</span>
            </p>
          </div>
          <Link href={eventPath(event.slug, "sahne")} target="_blank" className="inline-flex items-center gap-2 text-[0.9375rem] hover:underline">
            <MonitorPlayIcon size={18} /> Sahne modunu aç
          </Link>
        </div>

        {(manage || platform) && (
          <SessionNotice session={session} now={event.now} actions="Kilit, zamanlama, oylama ve askı" next={eventPath(event.slug, "yonetim")} />
        )}

        {consent && consent.missing.length > 0 && event.communitySlug && (
          <PolicyNotice slug={event.communitySlug} next={eventPath(event.slug, "yonetim")} blocking={consent.blocking} />
        )}

        {/* Sayfayı açabilen herkes etkinliği inceleyebilir; gerekçe görünür. */}
        <SuspensionNotice event={event} showReason />

        {!manage && (
          <p role="status" className="border-y border-rule-strong py-4 text-ink">
            {access?.policyPending ? "Salt okunur: güncel platform belgelerini onaylayana kadar yönetim işlemleri kapalı." : "Salt okunur: bu etkinliği yönetme yetkin yok ya da etkinlik askıda."}
          </p>
        )}

        {platform && (
          <Section title="Platform" note="Askı katılımcı yazmalarını ve topluluk yönetimini durdurur; kuyruktaki teslimler işlenir, süre dolunca kilit yine vurulur. Her iki yön de gerekçesiyle denetim kaydına yazılır.">
            <p role="status" className="mb-5 text-ink">
              Durum: <span className="font-medium">{event.suspended ? "Askıda" : "Yayında"}</span>
              {event.communityName && <span className="text-ink-2"> · {event.communityName}</span>}
            </p>
            <SuspendForm key={event.suspended ? "askida" : "yayinda"} eventId={event.id} suspended={event.suspended} />
          </Section>
        )}

        {event.locked ? (
          <Section title="Mühür vuruldu">
            <p className="text-ink-2">
              Mühür anı {formatDay(event.sealTime)}, {formatTime(event.sealTime)}. Kilit kalıcıdır; geri alınamaz ve zamanlama değiştirilemez.
            </p>
          </Section>
        ) : manage && (
          <>
            <Section title="Zamanlama" note="Başlangıçtan önce açılmış repolar ve önceden tarihli commit'ler aşağıdaki tabloda işaretlenir.">
              <ScheduleForm eventId={event.id} starts={toLocalInput(event.startsAt)} deadline={toLocalInput(event.deadline)} />
            </Section>
            <Section title="Mührü şimdi vur" note={`"Süre doldu" anonsunda kullan. Yeni proje ve değişiklik kabulü anında durur. Geri alınamaz.`}>
              <HoldToLock eventId={event.id} />
            </Section>
          </>
        )}

        {manage && !event.locked && (
          <Section title="Etkinlik kuralları" note="Katılımcı ilk kaydında bu bağlantıları platform koşullarından ayrı olarak onaylar. İlk katılımcı kaydından ya da başlangıçtan sonra değiştirilemez.">
            <EventTermsForm eventId={event.id} current={terms} />
          </Section>
        )}

        {manage && <>
          <Section title="Yemek ve etkinlik saati" note="Duyurduğun an ana sayfadaki maskot ve selam değişir; bitirene kadar sürer. Telegram grubuna da gider.">
            <ActivityForm eventId={event.id} current={event.activity} since={event.activity ? formatTime(event.activity.at).slice(0, 5) : null} />
          </Section>

          <Section title="Duyuru" note="Telegram grubuna da gider.">
            <AnnouncementForm eventId={event.id} current={event.announcement} />
          </Section>
        </>}

        <Section
          title="Halkın seçimi"
          note={
            event.locked
              ? `Her GitHub hesabı bir oy; kendi ekibine oy verilemez. Şu ana kadar ${voteCount ?? 0} oy.`
              : "Oylama, mühür vurulduktan sonra açılabilir."
          }
        >
          {manage && event.voting === "kapali" && (
            <ActionForm action={setVoting}>
              <input type="hidden" name="event" value={event.id} />
              <input type="hidden" name="state" value="acik" />
              <ActionButton pending="Oylama açılıyor…"
                disabled={!event.locked}
                className="press inline-flex h-12 items-center rounded-[2px] bg-ink px-5 text-[0.9375rem] font-medium text-wall disabled:opacity-50"
              >
                Oylamayı aç
              </ActionButton>
            </ActionForm>
          )}
          {manage && event.voting === "acik" && (
            <ActionForm action={setVoting}>
              <input type="hidden" name="event" value={event.id} />
              <input type="hidden" name="state" value="sonuclandi" />
              <ActionButton pending="Sonuçlar açıklanıyor…" className="press inline-flex h-12 items-center rounded-[2px] bg-ink px-5 text-[0.9375rem] font-medium text-wall">
                Oylamayı kapat ve sonuçları açıkla
              </ActionButton>
            </ActionForm>
          )}
          {event.voting === "sonuclandi" && <p className="text-ink-2">Sonuçlar vitrinde ve sahnede yayında.</p>}
        </Section>

        <Section title="Teslim işleri" note="Bu etkinliğin tamamlanmamış işleri. Kuyruk dakikalık zamanlayıcıyla da işlenir; her iş en fazla 5 kez denenir.">
          <ActionForm action={runWorker.bind(null, event.id)}><ActionButton pending="Kuyruk işleniyor…" className="press underline underline-offset-4">Kuyruğu şimdi işle</ActionButton></ActionForm>
          <DeliveryJobList jobs={jobs ?? []} />
        </Section>

        <Section title="Jüri paketi" note="Geçerli teslimler paketi yalnızca mühürlü arşivleri içerir; dışarıda kalanları nedenleriyle listeler. Eksiksiz paket için bütün kayıtların mührü tamamlanmış olmalı.">
          {juryReady ? (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem]">
              <a href={`/api/juri/${event.slug}?paket=gecerli`} className="underline underline-offset-4">Mühürlü teslimler ZIP</a>
              <a href={`/api/juri/${event.slug}?paket=eksiksiz`} className="underline underline-offset-4">Eksiksiz ZIP</a>
              <a href={`/api/juri/${event.slug}?format=csv`} className="underline underline-offset-4">CSV listesi</a>
            </p>
          ) : <p className="text-ink-2">Etkinlik kilitlendiğinde paket hazır olacak.</p>}
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

        {event.locked && <Section title="Jüri ödülleri" note="Ödülü açıkladığın anda vitrinin başında ve eser sayfasında yayımlanır, sahnede tören gösterisiyle açılır ve Telegram kanalına duyurulur. Sırayla açıklamak için ödülleri tören anında tek tek ekle.">
          {manage && <AwardForm eventId={event.id} projects={rows.filter(r => !!r.archive_path)} />}
          <ul className="mt-6 divide-y divide-rule">{awards.map(a => <li key={a.id} className="py-3">
            <p className="font-medium">{a.title} · {rows.find(r => r.id === a.project_id)?.name}</p><p className="text-sm text-ink-2">{a.reason}</p>
            {manage && <ActionForm action={removeAward}><input type="hidden" name="event" value={event.id} /><input type="hidden" name="id" value={a.id} /><ActionButton pending="Kaldırılıyor…" className="mt-2 text-sm text-ink-3 underline">Ödülü kaldır</ActionButton></ActionForm>}
          </li>)}</ul>
          {!manage && awards.length === 0 && <p className="text-ink-2">Henüz ödül açıklanmadı.</p>}
        </Section>}

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
        <JuryManagement event={event} canManage={manage} />
      </main>
    </>
  );
}
