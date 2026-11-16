// Manifest özeti: DB archive_expiry_preview ile aynı biçim. Yalnız sunucu/betik (node:crypto).
import { createHash } from "node:crypto";

export type ManifestRow = { path: string; bytes: number | string | null; sha256: string | null };

/** DB `archive_expiry_preview` ile aynı satır biçimi: "yol\tbayt\tsha256", bayt sırasıyla sıralı. */
export function manifestLines(rows: ManifestRow[]): string[] {
  return rows
    .map((r) => `${r.path}\t${r.bytes ?? ""}\t${r.sha256 ?? ""}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function manifestHash(rows: ManifestRow[]): string {
  return createHash("sha256").update(manifestLines(rows).join("\n"), "utf8").digest("hex");
}
