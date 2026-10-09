import test from "node:test";
import assert from "node:assert/strict";
import { createNonce, originOf, pageCsp } from "../lib/csp.ts";

const directive = (policy, name) => policy.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

test("A21: sayfa politikası betikleri yalnızca nonce ile çalıştırır", () => {
  const policy = pageCsp({ nonce: "abc123", supabaseOrigin: "https://x.supabase.co", dev: false });
  const scripts = directive(policy, "script-src");
  assert.match(scripts, /'nonce-abc123'/);
  assert.match(scripts, /'strict-dynamic'/);
  assert.doesNotMatch(scripts, /unsafe-inline|unsafe-eval/);
  assert.equal(directive(policy, "object-src"), "object-src 'none'");
  assert.equal(directive(policy, "frame-ancestors"), "frame-ancestors 'none'");
  assert.match(directive(policy, "form-action"), /https:\/\/x\.supabase\.co https:\/\/github\.com$/);
  assert.match(policy, /upgrade-insecure-requests/);
});

test("A21: geliştirme modu yalnızca eval ve websocket ekler", () => {
  const policy = pageCsp({ nonce: "n", supabaseOrigin: "", dev: true });
  assert.match(directive(policy, "script-src"), /'unsafe-eval'/);
  assert.match(directive(policy, "connect-src"), / ws:$/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
});

test("A21: nonce her çağrıda farklı ve en az 128 bit", () => {
  const a = createNonce();
  const b = createNonce();
  assert.notEqual(a, b);
  assert.equal(Buffer.from(a, "base64").length, 16);
  assert.match(a, /^[A-Za-z0-9+/]+=*$/);
});

test("Supabase adresi bozuksa politikaya eklenmez", () => {
  assert.equal(originOf("https://x.supabase.co/rest"), "https://x.supabase.co");
  assert.equal(originOf("bozuk"), "");
  assert.equal(originOf(undefined), "");
});
