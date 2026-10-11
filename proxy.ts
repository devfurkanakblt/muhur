import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createNonce, originOf, pageCsp } from "@/lib/csp";

// Supabase oturumunu her istekte tazeler; sayfa isteklerine nonce'lu içerik güvenlik politikası ekler.
export async function proxy(request: NextRequest) {
  // API yanıtlarının politikası next.config.ts'te sabittir; sayfalar her istekte yeni nonce alır (A21).
  const nonce = createNonce();
  const csp = request.nextUrl.pathname.startsWith("/api/") ? null : pageCsp({
    nonce,
    supabaseOrigin: originOf(process.env.NEXT_PUBLIC_SUPABASE_URL),
    dev: process.env.NODE_ENV !== "production",
  });

  // Next.js nonce'u istek başlığındaki politikadan okuyup kendi betiklerine ekler; layout satır içi tema
  // betiği için `x-nonce` başlığını okur. Yanıt da aynı politikayı taşır.
  const forward = () => {
    const headers = new Headers(request.headers);
    if (csp) {
      headers.set("content-security-policy", csp);
      headers.set("x-nonce", nonce);
    }
    const next = NextResponse.next({ request: { headers } });
    if (csp) next.headers.set("Content-Security-Policy", csp);
    return next;
  };

  let response = forward();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    // lib/supabase/server.ts ile aynı: oturum çerezleri HttpOnly.
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/cron|api/rozet|api/sahne|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
