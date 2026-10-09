import { formatBytes, formatDay, formatTime } from "@/lib/format";

type Sealed = {
  repo_full_name: string;
  repo_url: string;
  default_branch?: string;
  frozen_sha: string | null;
  frozen_method?: string | null;
  archive_sha256: string | null;
  archive_bytes?: number | null;
  freeze_error?: string | null;
  accepted_at?: string | null;
  accepted_branch?: string | null;
};

/** Mühür kaydının tablosu: panelde, eser sayfasında ve makbuzda aynı. */
export function SealRecord({ project, sealTime, print = false }: { project: Sealed; sealTime: string; print?: boolean }) {
  const rows: [string, React.ReactNode][] = [
    ["Mühür anı", `${formatDay(sealTime)}, ${formatTime(sealTime)} (Türkiye saati)`],
    ["Repo", project.repo_full_name],
    ...((project.accepted_branch ?? project.default_branch) ? ([["Dal", project.accepted_branch ?? project.default_branch]] as [string, React.ReactNode][]) : []),
    ...(project.accepted_at ? ([["Teslim kabulü", `${formatDay(project.accepted_at)}, ${formatTime(project.accepted_at)}`]] as [string, React.ReactNode][]) : []),
    [
      "Commit",
      project.frozen_sha ? (
        print ? (
          project.frozen_sha
        ) : (
          <a href={`${project.repo_url}/tree/${project.frozen_sha}`} target="_blank" rel="noreferrer" className="text-indigo hover:underline">
            {project.frozen_sha}
          </a>
        )
      ) : (
        project.freeze_error || !project.accepted_at ? "Kabul edilmiş teslim yok veya mühür tamamlanamadı." : "Mühürleniyor…"
      ),
    ],
    ["Arşiv SHA-256", project.archive_sha256 ?? (project.freeze_error ? "Arşivleme başarısız" : project.accepted_at ? "Doğrulama tamamlanıyor…" : "Arşiv yok")],
    ...(project.archive_bytes ? ([["Arşiv boyutu", formatBytes(project.archive_bytes)]] as [string, React.ReactNode][]) : []),
  ];
  return (
    <div>
      {project.freeze_error && <p role="alert" className="mb-4 text-danger">{project.freeze_error}</p>}
      <dl className="divide-y divide-rule border-y border-rule">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-3.5 sm:grid-cols-[160px_1fr] sm:gap-6">
            <dt className="text-[0.6875rem] font-medium tracking-[0.1em] text-ink-3 uppercase">{k}</dt>
            <dd className="font-mono text-[0.8125rem] break-all text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {project.frozen_method === "ara-muhur" && (
        <p className="mt-3 text-[0.875rem] text-ink-2">
          Kilit anında repoya ulaşılamadığı için son teslimden önce alınan son ara mühür esas alındı.
        </p>
      )}
    </div>
  );
}
