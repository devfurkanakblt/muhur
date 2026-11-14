// Bounded HTTP checks against the existing local fixture only.
// Requires: node tests/preview.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = 'http://127.0.0.1:3100';
const results = [];
async function check(name, path, options, inspect) {
  const response = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(60000), ...options });
  const body = await response.text();
  inspect(response, body);
  results.push({ name, status: response.status, passed: true });
  console.log(`PASS: ${name} (${response.status})`);
}
await check('anonymous admin denied', '/yonetim', {}, r => assert.equal(r.status, 404));
await check('anonymous jury export denied', '/api/juri/ornek-etkinlik', {}, r => assert.equal(r.status, 403));
await check('anonymous archive denied', '/api/arsiv/30000000-0000-0000-0000-000000000001', {}, r => assert.equal(r.status, 403));
await check('proxy bypass header does not authorize admin', '/yonetim', { headers: { 'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware' } }, r => assert.equal(r.status, 404));
await check('cron without secret denied', '/api/cron/tick', {}, r => assert.equal(r.status, 401));
await check('cron with wrong secret denied', '/api/cron/tick', { headers: { authorization: 'Bearer security-audit-invalid' } }, r => assert.equal(r.status, 401));
let nonce;
await check('page security headers and CSP nonce', '/', {}, (r, body) => {
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  nonce = r.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce); assert.ok(body.includes(`nonce="${nonce}"`));
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.ok(!body.includes('preview-invite'), 'Private invite code leaked');
});
await check('client cannot select CSP nonce', '/', { headers: { 'x-nonce': 'attacker-nonce' } }, r => {
  const csp = r.headers.get('content-security-policy');
  assert.ok(csp.includes('nonce-')); assert.ok(!csp.includes(nonce)); assert.ok(!csp.includes('attacker-nonce'));
});
await check('private status cache policy and minimal DTO', '/api/durum', {}, (r, body) => {
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ['deadline', 'locked', 'now', 'version']);
});
await check('cross-origin CORS not granted', '/api/durum', { headers: { Origin: 'https://attacker.invalid' } }, r => assert.equal(r.headers.get('access-control-allow-origin'), null));
await check('callback without code cannot redirect externally', '/auth/callback?next=//attacker.invalid', {}, r => {
  assert.equal(r.status, 307); assert.equal(new URL(r.headers.get('location')).origin, base);
});
await check('cross-origin Server Action rejected', '/', {
  method: 'POST', headers: { Origin: 'https://attacker.invalid', 'Next-Action': 'security-audit-invalid', 'Content-Type': 'text/plain' }, body: '[]',
}, (r, body) => { assert.ok(r.status >= 400); assert.ok(!body.includes('fixture-key')); });
mkdirSync('test-artifacts/security', { recursive: true });
writeFileSync('test-artifacts/security/http.json', JSON.stringify(results, null, 2) + '\n');
