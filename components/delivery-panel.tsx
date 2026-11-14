import { DELIVERY_LABELS, deliveryState } from "@/lib/delivery-policy";
import type { EventState, OwnProject, ProjectJob, TimelineEntry } from "@/lib/data";
import { formatDateTime, formatBytes } from "@/lib/format";
import { SubmissionButton } from "@/components/team-actions";
import { SealSuccess } from "@/components/seal-success";

const timelineLabels: Record<string, string> = {
  registered: "Proje kaydı oluşturuldu", submission_requested: "Teslim güncellemesi istendi",
  accepted: "Arşiv doğrulandı, teslim kabul edildi", sealed: "Mühür tamamlandı",
  submission_failed: "Teslim güncellemesi başarısız", seal_failed: "Mühürleme başarısız",
  submission_superseded: "Bekleyen sürüm yerini daha yeni sürüme bıraktı",
  snapshot: "Ara arşiv alındı", snapshot_failed: "Ara arşiv alınamadı", owner_transferred: "Kuruculuk devredildi",
};

export function DeliveryPanel({ project, event, jobs, timeline }: {
  project: OwnProject; event: EventState; jobs: ProjectJob[]; timeline: TimelineEntry[];
}) {
  const active = jobs.find(j => j.kind === "submit" && ["queued", "processing"].includes(j.state));
  // Yalnızca işlenmekte olan iş düğmeyi kilitler; sırada bekleyen iş yeni sürümle değiştirilebilir ya da hemen denenebilir.
  const retrying = active?.state === "queued" && active.attempts > 0;
  const latestFailed = jobs.find(j => j.state === "failed");
  const latestIsFailed = !!latestFailed && jobs[0]?.id === latestFailed.id;
  const effectiveProject = { ...project, delivery_error: project.delivery_error ?? (latestIsFailed ? latestFailed.error : null) };
  const state = deliveryState(effectiveProject, event.locked, !!active);
  const lastSnapshot = timeline.find(t => t.kind === "snapshot");
  const staleHealth = !project.health_checked_at || event.now - +new Date(project.health_checked_at) > 10 * 60_000;
  const outOfDate = !!project.repo_head_sha && project.repo_head_sha !== project.accepted_sha;
  const remaining = +new Date(event.deadline) - event.now;
  const error = event.locked ? project.freeze_error : effectiveProject.delivery_error;
  const checklist = [
    { ok: !staleHealth && !project.health_issues.includes("erisilemiyor"), label: staleHealth ? "Repo erişimi henüz güncel olarak doğrulanmadı" : "Repo erişilebilir" },
    { ok: !staleHealth && !!project.repo_head_sha && !project.health_issues.includes("bos"), label: "Varsayılan dalda kod var" },
    { ok: !!project.accepted_sha, label: "Teslim arşivi sunucuda doğrulandı" },
    { ok: !!project.accepted_sha && !outOfDate && !staleHealth, label: outOfDate ? "Son push henüz teslim sürümünde değil" : "Kontrol edilen son commit teslim sürümünde" },
    { ok: project.members.length > 0, label: `${project.members.length} ekip üyesi kayıtlı · davetlerini kontrol et` },
    { ok: !!lastSnapshot, label: lastSnapshot ? "Son ara arşiv başarılı" : "Ara arşiv henüz yok · son 3 saatte alınır" },
  ];
  return <section id="teslim" className="mb-12 border-y border-indigo bg-[var(--indigo-wash)] px-4 py-6 sm:px-6" aria-label="Kod teslim durumu">
    <p className="mb-3 text-[0.875rem] text-ink-2">Son teslim: {formatDateTime(event.deadline)}</p>
    <h2 className={`text-[1.125rem] font-semibold ${state === "failed" ? "text-danger" : "text-ink"}`} role="status">{DELIVERY_LABELS[state]}</h2>
    {!event.locked && <p className="mt-3 max-w-[70ch] text-[0.9375rem] leading-relaxed text-ink-2">
      Son push&apos;tan sonra teslim sürümünü güncelle. Yalnızca süre dolmadan arşivlenip doğrulanan son sürüm değerlendirilir.
      Güncelleme başarısız olursa kabul edilmiş önceki sürüm korunur.
    </p>}
    {!event.locked && remaining <= 60 * 60_000 && remaining > 0 && <p role="alert" className="mt-3 font-medium text-indigo">
      Son {Math.ceil(remaining / 60_000)} dakika. Arşivleme genellikle birkaç saniye sürer; son 10 saniyede istenen güncellemenin
      yetişmesi garanti değil. Son saniyeyi bekleme.
    </p>}
    {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    {event.locked && !project.accepted_sha && !project.archive_sha256 && <p className="mt-3 text-danger">
      Süre dolmadan kabul edilmiş kod teslimi yok. Proje kaydı bulunması, kodun teslim edildiği anlamına gelmez.
    </p>}
    {project.accepted_sha && <dl className="mt-4 grid gap-2 text-[0.875rem]">
      <div><dt className="inline text-ink-3">Kabul edilmiş commit: </dt><dd className="inline break-all font-mono">{project.accepted_sha}</dd></div>
      <div><dt className="inline text-ink-3">Dal: </dt><dd className="inline font-mono">{project.accepted_branch}</dd></div>
      <div><dt className="inline text-ink-3">Kabul zamanı: </dt><dd className="inline">{formatDateTime(project.accepted_at!)}</dd></div>
      {project.accepted_archive_bytes && <div><dt className="inline text-ink-3">Doğrulanmış arşiv: </dt><dd className="inline">{formatBytes(project.accepted_archive_bytes)}</dd></div>}
    </dl>}
    {!event.locked && project.repo_head_sha && <div className="mt-4 border-l-2 border-rule-strong pl-4">
      <p className="text-[0.875rem] font-medium">{outOfDate ? "Yeni commit henüz teslim edilmedi." : project.accepted_sha ? "Kontrol edilen commit teslim sürümüyle aynı." : "Repoda kod var; kabul edilmiş teslim henüz yok."}</p>
      <p className="mt-2 break-all text-[0.875rem] text-ink-2">Kontrol edilen son commit: <span className="font-mono">{project.repo_head_sha}</span></p>
      <p className="mt-1 text-[0.8125rem] text-ink-3">{project.health_checked_at ? `Repo kontrolü: ${formatDateTime(project.health_checked_at)}.${staleHealth ? " Bu kontrol eski; son push durumunu kesinleştirmez." : ""}` : "Repo kontrol zamanı bilinmiyor."}</p>
    </div>}
    {!event.locked && <div className="mt-5"><SubmissionButton eventId={event.id} pendingJob={active?.state === "processing"} hasVersion={!!project.accepted_sha} suspended={event.suspended} /></div>}
    {project.accepted_sha && <div className="mt-4 grid gap-2 text-[0.875rem]">
      <a href={`/api/arsiv/${project.id}?surum=kabul`} className="inline-flex min-h-11 items-center underline">Kabul edilmiş teslim arşivini indir</a>
      {project.accepted_archive_sha256 && <p className="break-all text-ink-2">Arşivin SHA-256 özeti: <span className="font-mono">{project.accepted_archive_sha256}</span></p>}
    </div>}
    {active && <p className="mt-3 text-[0.875rem] text-ink-2">{retrying
      ? "Önceki deneme geçici bir hatayla durdu; birkaç saniye içinde yeniden denenecek. Beklemeden denemek ya da yeni push'unu teslim etmek için teslim sürümünü yeniden güncelleyebilirsin."
      : active.state === "queued" ? "İş sırada. Sonuç otomatik güncellenecek." : "Arşiv alınıyor ve depodaki kopya doğrulanıyor."} Deneme {active.attempts}/5.</p>}
    {!event.locked && <details open={!project.accepted_sha || outOfDate || state === "failed"} className="mt-6">
      <summary className="cursor-pointer font-medium">Teslime hazırlık</summary>
      <ul className="mt-3 grid gap-2 text-[0.875rem]">{checklist.map(c => <li key={c.label} className={c.ok ? "text-ink-2" : "text-ink"}>
        <span aria-hidden>{c.ok ? "✓" : "○"}</span> {c.label}
      </li>)}</ul>
    </details>}
    {project.archive_sha256 && <SealSuccess projectId={project.id} />}
    <details className="mt-6">
      <summary className="cursor-pointer font-medium">Teslim zaman çizelgesi</summary>
      <ol className="mt-4 grid gap-3 text-[0.875rem]">{timeline.length ? timeline.map(t => <li key={t.id}>
        <time dateTime={t.occurred_at} className="text-ink-3">{formatDateTime(t.occurred_at)}</time>
        <p>{timelineLabels[t.kind] ?? t.kind}{t.detail && <span className="ml-2 break-all text-ink-2">{t.detail}</span>}</p>
      </li>) : <li className="text-ink-2">Henüz ek işlem kaydı yok.</li>}</ol>
    </details>
  </section>;
}
