/**
 * Sayfalar için zorunlu içerik güvenlik politikası (denetim A21).
 * Betikler yalnızca her istekte üretilen nonce ile çalışır; Next.js kendi betiklerine bu nonce'u istek
 * başlığındaki politikadan okuyarak ekler. Satır içi `style` öznitelikleri kullanıldığı için stillerde
 * 'unsafe-inline' kalır; betik çalıştırmaya izin vermez.
 */
export function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function pageCsp({ nonce, supabaseOrigin, dev }: { nonce: string; supabaseOrigin: string; dev: boolean }) {
  const supabase = supabaseOrigin ? ` ${supabaseOrigin}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabase} https://avatars.githubusercontent.com`,
    "font-src 'self'",
    `connect-src 'self'${supabase}${dev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    `form-action 'self'${supabase} https://github.com`,
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function originOf(url: string | undefined) {
  try { return url ? new URL(url).origin : ""; } catch { return ""; }
}
