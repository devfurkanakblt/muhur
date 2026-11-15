// Plan 4: sözleşme metinlerini önizler ve taslak olarak yükler. YAYINLAMAZ.
// Yayın yalnız /yonetim/belgeler sayfasında, taze oturumlu head admin ile yapılır; service key tek başına aktör yetkisi değildir.
//
//   npm run policy -- preview <tür> <sürüm> <dosya>                 # yalnız yerel: normalleştirme + SHA-256
//   npm run policy -- draft   <tür> <sürüm> <dosya> --actor <uuid>  # head admin adına taslak kaydeder (create_policy_draft)
//
// <tür>: platform | data_processing | participant
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizePolicyText, policyDraftError } from "../lib/policies.ts";
import { policyHash } from "../lib/policy-hash.ts";

/** Dosya içeriğini yayın politikasına göre hazırlar; hata varsa { error }. */
export function preparePolicy(kind, version, raw) {
  const text = normalizePolicyText(raw);
  const error = policyDraftError(kind, version, text);
  if (error) return { error };
  const warnings = [];
  if (text !== raw) warnings.push("Dosya normalleştirildi (BOM/CRLF/NFC). Yüklenen metin dosyadan bayt olarak farklıdır.");
  if (/(^|[^\p{L}])(taslak|örnek|lorem ipsum|todo)(?!\p{L})/iu.test(text)) warnings.push("Metinde taslak/örnek ifadesi var. Hukuki incelemesi tamamlanmamış metni yayınlama.");
  return { text, sha256: policyHash(text), chars: text.length, bytes: Buffer.byteLength(text, "utf8"), warnings };
}

async function main() {
  const [command, kind, version, file, ...rest] = process.argv.slice(2);
  if (!["preview", "draft"].includes(command) || !kind || !version || !file) {
    console.error("Kullanım: npm run policy -- preview|draft <tür> <sürüm> <dosya> [--actor <uuid>]");
    process.exit(1);
  }
  const prepared = preparePolicy(kind, version, await readFile(file, "utf8"));
  if (prepared.error) { console.error(prepared.error); process.exit(1); }
  console.log(`${kind} ${version}: ${prepared.chars} karakter, ${prepared.bytes} bayt`);
  console.log(`SHA-256: ${prepared.sha256}`);
  for (const w of prepared.warnings) console.warn(`Uyarı: ${w}`);
  if (command === "preview") return;

  const actorIndex = rest.indexOf("--actor");
  const actor = actorIndex >= 0 ? rest[actorIndex + 1] : "";
  if (!/^[0-9a-f-]{36}$/i.test(actor ?? "")) { console.error("--actor <head admin kullanıcı UUID'si> gerekli."); process.exit(1); }
  const { default: envPackage } = await import("@next/env");
  envPackage.loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli."); process.exit(1); }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const role = await db.from("platform_roles").select("login").eq("user_id", actor).eq("role", "head_admin").maybeSingle();
  if (role.error || !role.data) { console.error("Bu kullanıcı head admin değil."); process.exit(1); }
  // SQL aynı kuralları (head admin, sürüm, NFC/LF) ayrıca uygular ve hash'i kendisi hesaplar.
  const { data, error } = await db.rpc("create_policy_draft", { p_actor: actor, p_login: role.data.login, p_kind: kind, p_version: version, p_content: prepared.text });
  if (error) { console.error(`Taslak kaydedilemedi: ${error.message}`); process.exit(1); }
  const check = await db.from("policy_documents").select("content_sha256,status").eq("id", data).maybeSingle();
  if (check.error || check.data?.content_sha256 !== prepared.sha256) { console.error("Kaydedilen taslağın özeti yereldekiyle eşleşmiyor; yayınlama."); process.exit(1); }
  console.log(`Taslak kaydedildi (${data}). Okuyup yayınlamak için: /yonetim/belgeler`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
