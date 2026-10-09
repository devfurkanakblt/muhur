import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Oturum çerezleri tarayıcı JS'ine kapalıdır: auth yalnızca sunucuda yürür, tarayıcıda Supabase istemcisi yoktur.
 * Oturumdaki GitHub provider token'ı böylece okunabilir bir çerezde kalmaz.
 */
export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/** Oturumu çerezlerden okuyan istemci (yalnızca auth ve okumalar için). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component içinden çağrıldıysa yazılamaz; proxy oturumu tazeler.
        }
      },
    },
  });
}

/** Tüm yazmalar bu istemciyle, sunucuda ve kilit kontrolünden sonra yapılır. */
export function createAdminClient() {
  return createSupabaseClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []), AbortSignal.timeout(45_000),
      ]) }),
    },
  });
}
