import envPackage from "@next/env";
import { createClient } from "@supabase/supabase-js";

envPackage.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase ortam değişkenleri eksik; şema doğrulanamadı.");
  process.exitCode = 1;
} else {
  const db = createClient(url, key, { auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) } });
  const { error } = await db.from("projects").select("id, accepted_sha, demo_url, repo_head_sha").limit(1);
  if (error) {
    console.error(error.code === "42703" || error.code === "PGRST204" ? "0004_delivery.sql migration henüz uygulanmamış." : "Supabase bağlantısı veya şema doğrulanamadı. Anahtar değerleri yazdırılmadı.");
    process.exitCode = 1;
  } else {
    console.log("Teslim şeması erişilebilir.");
    const [audit, tallies] = await Promise.all([
      db.from("admin_audit").select("id").limit(1),
      db.rpc("vote_tallies", { p_event: "00000000-0000-0000-0000-000000000000" }),
    ]);
    if (audit.error || tallies.error) {
      const missing = [audit.error, tallies.error].some(e => e && ["42P01", "PGRST202", "PGRST205", "42883"].includes(e.code));
      console.error(missing ? "0005_hardening.sql migration henüz uygulanmamış." : "0005 şeması doğrulanamadı. Anahtar değerleri yazdırılmadı.");
      process.exitCode = 1;
    } else {
      console.log("Sertleştirme şeması (0005) erişilebilir.");
      const { data: version, error: versionError } = await db.rpc("delivery_schema_version");
      if (versionError || version < 6) {
        console.error(versionError && !["PGRST202", "42883"].includes(versionError.code) ? "0006 şeması doğrulanamadı." : "0006_son_dakika.sql migration henüz uygulanmamış.");
        process.exitCode = 1;
      } else console.log("Son dakika teslim şeması (0006) erişilebilir.");
    }
  }
}
