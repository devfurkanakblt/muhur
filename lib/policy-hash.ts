import { createHash } from "node:crypto";

/** Normalleştirilmiş belge metninin UTF-8 baytlarının SHA-256'sı; SQL'deki encode(sha256(convert_to(...))) ile aynı. */
export function policyHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
