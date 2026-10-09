import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Sayfaların içerik güvenlik politikası proxy.ts'te her istek için nonce ile üretilir (lib/csp.ts).
// Burada yalnızca politikadan bağımsız başlıklar ve API yanıtlarının sabit politikası var; aynı yanıtta
// ikinci bir politika nonce'suz olduğu için betikleri engellerdi.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

// API yanıtları (JSON, ZIP, yönlendirme) hiçbir kaynak yüklemez ve çerçevelenmez.
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

// Görsel olarak gömülen SVG uç noktaları (rozet, QR) hariç: onlar yalnızca <img> içinde kullanılır.
const apiRoutes = ["/api/arsiv/:path*", "/api/juri/:path*", "/api/durum", "/api/sahne", "/api/cron/:path*"];

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
    return [
      { source: "/:path*", headers: securityHeaders },
      ...apiRoutes.map((source) => ({ source, headers: [{ key: "Content-Security-Policy", value: API_CSP }] })),
    ];
  },
};

export default nextConfig;
