// Offline audit probes: no live credentials, network requests, or database writes.
// Run: node --import ./tests/register.mjs audit/security-probes.mjs
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { crc32, deflateRawSync } from 'node:zlib';
import { validateArchive } from '../lib/delivery-core.ts';
import { ZIP_LIMITS } from '../lib/zip-check.ts';

const results = [];
function record(name, status, evidence) {
  results.push({ name, status, evidence });
  console.log(`${status}: ${name}: ${JSON.stringify(evidence)}`);
}
function isolatedModule(file, mocks) {
  const output = transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const context = vm.createContext({ exports, console, FormData, URL, Response, Request,
    require(name) {
      if (name in mocks) return mocks[name];
      throw new Error(`Unmocked import blocked: ${name}`);
    },
  });
  vm.runInContext(output, context, { filename: file, timeout: 5000 });
  return exports;
}

// Execute actual mascot actions with a fake DAL. No real Supabase module is loaded.
let viewer = null;
let writes = [];
let freshnessReads = 0;
const fakeDb = {
  from(table) {
    const query = {
      select() { return query; }, eq() { return query; },
      update(value) { writes.push({ table, value }); return query; },
      insert(value) { writes.push({ table, value }); return query; },
      maybeSingle: async () => ({ data: { id: 'fixture', event_id: 'fixture' }, error: null }),
      then(done) { return Promise.resolve({ count: 1, data: null, error: null }).then(done); },
    };
    return query;
  },
};
const mascot = isolatedModule('app/maskot/actions.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/data': {
    getViewer: async () => viewer,
    getEvent: async () => ({ id: 'fixture' }),
    getAdminSession: async () => { freshnessReads++; return { fresh: false }; },
  },
  '@/lib/supabase/server': { createAdminClient: () => fakeDb },
});
for (const name of Object.keys(mascot)) {
  writes = [];
  const answer = await mascot[name](undefined, new FormData());
  assert.ok(answer.error);
  assert.equal(writes.length, 0);
  record(`anonymous ${name}`, 'PASS', 'Denied before database write');
}
viewer = { id: 'ordinary-user', isAdmin: false };
for (const name of ['setMascotPhase', 'setMascotProposalVisibility']) {
  writes = [];
  const answer = await mascot[name](undefined, new FormData());
  assert.ok(answer.error);
  assert.equal(writes.length, 0);
  record(`non-admin ${name}`, 'PASS', 'Denied before database write');
}
viewer = { id: 'admin', isAdmin: true };
writes = [];
const phase = new FormData(); phase.set('phase', 'sonuc');
const answer = await mascot.setMascotPhase(undefined, phase);
record('mascot finalization with stale admin session', answer.ok && writes.length && !freshnessReads ? 'FINDING' : 'PASS', {
  accepted: answer.ok === true, databaseWrites: writes.length, freshnessReads,
  scope: 'Action-level mock; stale status is available but not queried; not a live session exploit',
});

// Small ZIPs, never extracted to disk. Expansion probe is capped at 8 MiB.
function zip(nameText, raw, localNameText = nameText) {
  const name = Buffer.from(nameText), localName = Buffer.from(localNameText);
  const data = deflateRawSync(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(localName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10); central.writeUInt32LE(crc32(raw), 16);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + localName.length + data.length, 16);
  return Buffer.concat([local, localName, data, central, name, end]);
}
for (const name of ['../outside', '/absolute', 'C:/absolute', 'repo/../../outside']) {
  assert.throws(() => validateArchive(zip(name, Buffer.from('safe test'))));
}
record('central-directory traversal', 'PASS', '4 unsafe paths rejected');
for (const [label, central, local] of [
  ['local filename differs from central directory', 'safe.txt', '../escape'],
  ['Windows UNC filename', '\\\\server\\share\\file', '\\\\server\\share\\file'],
]) {
  let accepted = false;
  try { validateArchive(zip(central, Buffer.from('safe test'), local)); accepted = true; } catch { /* rejected */ }
  record(label, accepted ? 'GAP' : 'PASS', { accepted, scope: 'Parser hardening only; GitHub-generated archive reachability not established' });
}
const compressed = zip('repo/repeated.txt', Buffer.alloc(8 * 1024 * 1024, 65));
const started = performance.now();
const expanded = validateArchive(compressed);
record('bounded archive expansion', 'RISK', {
  compressedBytes: compressed.length, expandedBytes: expanded.uncompressedBytes,
  ratio: Math.round(expanded.uncompressedBytes / compressed.length),
  synchronousElapsedMs: Math.round(performance.now() - started),
  configuredExpansionLimit: ZIP_LIMITS.maxUncompressedBytes,
  scope: '8 MiB accepted; no 1 GiB test or service exhaustion attempted',
});

// Inspect secrets in memory; print only variable names and file paths on a match.
// This is exact matching of currently configured private values, not a history scan.
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
const envText = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const secrets = [...envText.matchAll(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/gm)]
  .map(([, name, value]) => ({ name, value: value.replace(/^['"]|['"]$/g, '') }))
  .filter(({ name, value }) => !name.startsWith('NEXT_PUBLIC_') && /SECRET|TOKEN|KEY|PASSWORD/.test(name) && value.length >= 16);
const matches = [];
let checked = 0;
for (const file of tracked) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file);
  if (content.includes(0) || content.length > 5 * 1024 * 1024) continue;
  checked++;
  const text = content.toString('utf8');
  for (const secret of secrets) if (text.includes(secret.value)) matches.push({ file, variable: secret.name });
}
record('configured private secrets in tracked text', matches.length ? 'FINDING' : 'PASS', {
  checkedFiles: checked, configuredSecretsChecked: secrets.length, matches,
  scope: 'Current tracked text only; history and deployed bundles not scanned',
});
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve('next/package.json'));
record('sharp resolved from Next.js', 'INFO', { version: nextRequire('sharp').versions.sharp });
mkdirSync('test-artifacts/security', { recursive: true });
writeFileSync(resolve('test-artifacts/security/probes.json'), JSON.stringify(results, null, 2) + '\n');
