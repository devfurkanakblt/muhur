import type { NextConfig } from "next";

const supabase = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin; } catch { return ""; }
})();
const dev = process.env.NODE_ENV !== "production";

// Uygulanan politika yalnızca sayfayı bozmayacak yönergeleri içerir: çerçeveleme, base ve form hedefleri.
// Giriş akışı Supabase üzerinden GitHub'a yönlenir.
const enforced = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  `form-action 'self' ${supabase} https://github.com`.trim(),
].join("; ");

// Kaynak listesi önce rapor modunda izlenir; ihlal görülmezse uygulanan politikaya taşınabilir.
// Tema betiği satır içi olduğu için script-src 'unsafe-inline' içerir (nonce için tüm sayfalar dinamik olmalı).
const reportOnly = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase} https://avatars.githubusercontent.com`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${supabase}${dev ? " ws:" : ""}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: enforced },
  { key: "Content-Security-Policy-Report-Only", value: reportOnly },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  distDir: process.env.MUHUR_TEST_PREVIEW === "1" ? ".next-preview" : ".next",
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    // Local browser fixtures do not depend on the development debug WebSocket.
    ...(process.env.MUHUR_TEST_PREVIEW === "1" ? { reactDebugChannel: false } : {}),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
