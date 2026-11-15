"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { getAdminSession, getGithubViewer } from "@/lib/data";
import { UUID, communityError } from "@/lib/community-input";

export type PolicyAdminState = { ok?: boolean; error?: string } | undefined;
const FRESH = "Belge yayını için GitHub ile yeniden giriş yap; oturumun son 12 saat içinde açılmış olmalı.";

/**
 * Taslağı yayınlar ve türün geçerli sürüm işaretçisini değiştirir. Yalnız taze oturumlu head admin; service key
 * tek başına aktör yetkisi sayılmaz. `expected` eşzamanlı başka bir yayını yakalar (eski sayfadan yayın reddedilir).
 */
export async function publishPolicy(_previous: PolicyAdminState, form: FormData): Promise<PolicyAdminState> {
  const viewer = await getGithubViewer();
  if (!viewer?.isHeadAdmin) return { error: "Yetkisiz" };
  if (!(await getAdminSession())?.fresh) return { error: FRESH };
  const id = String(form.get("document") ?? ""), expected = String(form.get("expected") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!UUID.test(id) || (expected && !UUID.test(expected))) return { error: "Belge bilgisi değişmiş. Sayfayı yenile." };
  if (form.get("confirm") !== "on") return { error: "Metni okuduğunu ve yayınlanınca değiştirilemeyeceğini onayla." };
  const result = await createAdminClient().rpc("publish_policy_document", { p_actor: viewer.id, p_login: viewer.login, p_document: id, p_expected_current: expected || null, p_reason: reason });
  if (result.error) return { error: communityError(result.error) };
  revalidatePath("/yonetim/belgeler", "layout"); revalidatePath("/kosullar", "layout"); revalidatePath("/topluluk", "layout");
  return { ok: true };
}
