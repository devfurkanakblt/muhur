export type JuryRow = {
  id: string;
  exhibit_no: number;
  name: string;
  team_name: string;
  summary: string;
  demo_url: string | null;
  repo_full_name: string;
  frozen_sha: string | null;
  frozen_at: string | null;
  archive_path: string | null;
  archive_sha256: string | null;
  archive_bytes: number | null;
  accepted_sha: string | null;
  accepted_at: string | null;
  accepted_branch: string | null;
  freeze_error: string | null;
  members: { github_login: string }[];
};

/** Jüri paketine girmeyen kaydın nedeni; mühürlü kayıt için null. */
export function exclusionReason(p: Pick<JuryRow, "archive_path" | "archive_sha256" | "accepted_sha" | "freeze_error">) {
  if (p.archive_path && p.archive_sha256) return null;
  if (!p.accepted_sha) return "Süre dolmadan kabul edilmiş kod teslimi yok.";
  if (p.freeze_error) return `Mühürleme tamamlanamadı: ${p.freeze_error}`;
  return "Mühürleme henüz tamamlanmadı.";
}
