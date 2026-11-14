// Tek seferlik: ADMIN_GITHUB_IDS içindeki ilk GitHub kimliğini head admin yapar (ve deu-csai sahibi atar).
// Kullanım: node scripts/bootstrap-head-admin.mjs
import envPackage from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";

/** Kullanıcı listesinde sabit sayısal GitHub kimliğine sahip kullanıcıyı bulur; {id, login} ya da null. */
export function findGithubUser(users, githubId) {
  const wanted = String(githubId ?? "").trim();
  if (!/^\d+$/.test(wanted)) return null;
  for (const user of users ?? []) {
    for (const identity of user.identities ?? []) {
      if (identity.provider !== "github") continue;
      const data = identity.identity_data ?? {};
      const id = [data.provider_id, data.sub, identity.id].map((v) => (v == null ? "" : String(v))).find(Boolean);
      if (id !== wanted) continue;
      const login = [data.user_name, data.preferred_username].find((v) => typeof v === "string" && v.trim());
      return { id: user.id, login: login ? login.trim() : "" };
    }
  }
  return null;
}

async function main() {
  envPackage.loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const githubId = (process.env.ADMIN_GITHUB_IDS ?? "").split(",")[0].trim();
  if (!url || !key || !githubId) {
    console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ve ADMIN_GITHUB_IDS gerekli; biri eksik.");
    process.exit(1);
  }
  if (!/^\d+$/.test(githubId)) {
    console.error("ADMIN_GITHUB_IDS ilk değeri sayısal GitHub kimliği olmalı.");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  let found = null;
  const perPage = 200;
  for (let page = 1; !found; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error(`Kullanıcılar okunamadı: ${error.message}`);
      process.exit(1);
    }
    const users = data?.users ?? [];
    found = findGithubUser(users, githubId);
    if (users.length < perPage) break;
  }
  if (!found) {
    console.error("GitHub kimliği bulunamadı: bu kimlikle giriş yapmış kullanıcı yok. Önce siteye GitHub ile bir kez giriş yapın.");
    process.exit(1);
  }
  const { data, error } = await db.rpc("bootstrap_head_admin", { p_user: found.id, p_login: found.login });
  if (error) {
    console.error(`bootstrap_head_admin başarısız: ${error.message}`);
    process.exit(1);
  }
  console.log(data === true
    ? `Head admin atandı (${found.login || found.id}) ve deu-csai sahibi yapıldı.`
    : "Zaten bir head admin var; değişiklik yapılmadı.");
}

import { resolve } from "node:path";
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
