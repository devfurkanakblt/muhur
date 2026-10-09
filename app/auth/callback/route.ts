import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/panel";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/panel";
  if (!code) return NextResponse.redirect(`${origin}/?hata=giris`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/?hata=giris`);

  const response = NextResponse.redirect(`${origin}${safeNext}`);
  // GitHub token'ı yalnızca repo listesi ve yazma yetkisi kontrolü için, httpOnly çerezde tutulur.
  if (data.session?.provider_token) {
    response.cookies.set("gh_token", data.session.provider_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  }
  return response;
}
