import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { githubIdentity } from "@/lib/identity";
import { safeAuthNext } from "@/lib/auth-redirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/?hata=giris`);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/?hata=giris`);
  let next = safeAuthNext(searchParams.get("next"));
  if (!searchParams.has("next")) {
    const db = createAdminClient();
    const members = await db.from("community_members").select("community:communities(slug,status)").eq("user_id", data.user.id);
    if (members.error) return NextResponse.redirect(`${origin}/?hata=giris`);
    const communities = (members.data ?? []).flatMap(m => Array.isArray(m.community) ? m.community : m.community ? [m.community] : []).filter(c => c.status === "onaylandi");
    if (communities.length === 1) next = `/topluluk/${encodeURIComponent(communities[0].slug)}`;
    else if (communities.length > 1) next = "/yonetim";
    else {
      const application = await db.from("communities").select("id").eq("applicant_id", data.user.id).limit(1);
      if (application.error) return NextResponse.redirect(`${origin}/?hata=giris`);
      if (application.data?.length) next = "/topluluk/basvurularim";
    }
  }
  const response = NextResponse.redirect(`${origin}${next}`);
  // Önceki sağlayıcı tokenını taşıma. LinkedIn tokenı GitHub çerezi olamaz.
  response.cookies.delete("gh_token");
  const github = githubIdentity(data.user);
  const token = data.session?.provider_token;
  if (github && token) {
    try {
      const me = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
      const profile = me.ok ? await me.json() : null;
      if (String(profile?.id) === github.githubId) response.cookies.set("gh_token", token, {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 3600,
      });
    } catch { /* Repo sahipliği yolu yeniden GitHub girişi isteyebilir; token loglanmaz. */ }
  }
  return response;
}
