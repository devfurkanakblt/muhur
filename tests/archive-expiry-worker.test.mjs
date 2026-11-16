import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runArchiveExpiry } from "../lib/archive-expiry-worker.ts";

const path = (n) => `teslim/00000000-0000-0000-0000-${String(n).padStart(12, "0")}.zip`;

/** 0020 RPC semantiğinin bellek içi karşılığı: kira, token, deneme sınırı, finalize. */
function ledger({ enabled = true, objects = [], leaseMs = 5 * 60_000, clock }) {
  const now = clock ?? (() => Date.now());
  const rows = objects.map((o, i) => ({ id: `o${i}`, run_id: o.run ?? "r1", event_id: o.event ?? "e1", bucket: o.bucket ?? "archives", path: o.path, state: "pending", lease_token: null, lease_until: 0, attempts: 0, next: 0 }));
  const runs = new Map();
  for (const r of rows) runs.set(r.run_id, "deleting");
  const audits = [];
  return {
    rows, runs, audits,
    deps: (storage, extra = {}) => ({
      enabled: async () => enabled,
      dueEvents: async () => [],
      prepare: async () => "r1",
      claim: async (limit) => {
        for (const r of rows) if (r.state === "processing" && r.lease_until < now()) Object.assign(r, { state: "pending", lease_token: null });
        const picked = rows.filter((r) => r.state === "pending" && r.next <= now()).slice(0, limit);
        for (const r of picked) Object.assign(r, { state: "processing", lease_token: randomUUID(), lease_until: now() + leaseMs, attempts: r.attempts + 1 });
        return picked.map((r) => ({ ...r }));
      },
      remove: storage.remove,
      complete: async (id, token) => {
        const r = rows.find((x) => x.id === id);
        if (!r || r.state !== "processing" || r.lease_token !== token) return false;
        Object.assign(r, { state: "deleted", lease_token: null });
        audits.push(r.path);
        return true;
      },
      fail: async (id, token, msg) => {
        const r = rows.find((x) => x.id === id);
        if (!r || r.state !== "processing" || r.lease_token !== token) return false;
        Object.assign(r, r.attempts >= 5 ? { state: "failed", lease_token: null, error: msg } : { state: "pending", lease_token: null, error: msg, next: now() + 1 });
        return true;
      },
      finalize: async (run) => {
        const mine = rows.filter((r) => r.run_id === run);
        if (mine.some((r) => ["pending", "processing"].includes(r.state))) return "deleting";
        const state = mine.some((r) => r.state === "failed") ? "failed" : "completed";
        runs.set(run, state);
        return state;
      },
      ...extra,
    }),
  };
}

function storage(paths, behavior = {}) {
  const files = new Set(paths);
  const calls = [];
  return {
    files, calls,
    remove: async (bucket, p) => {
      calls.push(p);
      if (behavior[p]) await behavior[p]();
      if (!files.has(p)) return "not_found";
      files.delete(p);
      return "deleted";
    },
  };
}

test("ayar kapalıyken hiçbir şey hazırlanmaz ve silinmez", async () => {
  const l = ledger({ enabled: false, objects: [{ path: path(1) }] });
  const s = storage([path(1)]);
  let prepared = 0;
  const result = await runArchiveExpiry(l.deps(s, { prepare: async () => { prepared++; return "r"; }, dueEvents: async () => ["e1"] }));
  assert.equal(result.enabled, false);
  assert.equal(prepared, 0);
  assert.deepEqual(s.calls, []);
});

test("normal tur: önce Storage silinir, sonra defter tamamlanır; iş completed", async () => {
  const l = ledger({ objects: [1, 2, 3].map((n) => ({ path: path(n) })) });
  const order = [];
  const s = storage([1, 2, 3].map(path));
  const deps = l.deps(s);
  const remove = deps.remove, complete = deps.complete;
  deps.remove = async (b, p) => { order.push(`sil:${p}`); return remove(b, p); };
  deps.complete = async (id, t) => { order.push(`tamam:${l.rows.find((r) => r.id === id).path}`); return complete(id, t); };
  const result = await runArchiveExpiry(deps);
  assert.equal(result.deleted, 3);
  assert.equal(s.files.size, 0);
  assert.equal(l.runs.get("r1"), "completed");
  for (const n of [1, 2, 3]) assert.ok(order.indexOf(`sil:${path(n)}`) < order.indexOf(`tamam:${path(n)}`));
});

test("eksik nesne açık not-found sonucuyla idempotent tamamlanır", async () => {
  const l = ledger({ objects: [{ path: path(1) }, { path: path(2) }] });
  const s = storage([path(1)]);
  const result = await runArchiveExpiry(l.deps(s));
  assert.equal(result.deleted, 1);
  assert.equal(result.notFound, 1);
  assert.equal(l.runs.get("r1"), "completed");
});

test("Storage 429/5xx bulunamadı sayılmaz: yeniden denenir, sınırdan sonra terminal; iş tamamlandı sayılmaz", async () => {
  let t = 0;
  const l = ledger({ objects: [{ path: path(1) }, { path: path(2) }], clock: () => t });
  const s = storage([path(1), path(2)], { [path(2)]: async () => { throw new Error("Storage 503"); } });
  for (let i = 0; i < 6; i++) { t += 10; await runArchiveExpiry(l.deps(s), { budgetMs: 1_000 }); }
  assert.equal(l.rows[1].state, "failed");
  assert.equal(l.rows[1].attempts, 5);
  assert.ok(s.files.has(path(2)), "Hata alan dosya silinmiş sayıldı.");
  assert.equal(l.runs.get("r1"), "failed");
});

test("iki eşzamanlı işçi aynı dosyayı iki kez işlemez", async () => {
  const l = ledger({ objects: Array.from({ length: 12 }, (_, i) => ({ path: path(i + 1) })) });
  const s = storage(Array.from({ length: 12 }, (_, i) => path(i + 1)), Object.fromEntries(Array.from({ length: 12 }, (_, i) => [path(i + 1), () => new Promise((r) => setTimeout(r, 2))])));
  const [a, b] = await Promise.all([runArchiveExpiry(l.deps(s), { batch: 3 }), runArchiveExpiry(l.deps(s), { batch: 3 })]);
  assert.equal(a.deleted + b.deleted, 12);
  assert.equal(new Set(s.calls).size, s.calls.length, "Aynı yol iki kez silinmeye çalışıldı.");
  assert.ok(l.rows.every((r) => r.state === "deleted"));
});

test("silme ortasında süreç kaybı ve DB tamamlama hatası: sonraki tur not-found ile tamamlar", async () => {
  let t = 0;
  const l = ledger({ objects: [{ path: path(1) }], leaseMs: 100, clock: () => t });
  const s = storage([path(1)]);
  const crashed = await runArchiveExpiry(l.deps(s, { complete: async () => { throw new Error("DB bağlantısı koptu"); } }));
  assert.equal(crashed.completeErrors, 1);
  assert.equal(s.files.has(path(1)), false, "Dosya silinmiş olmalı");
  assert.equal(l.rows[0].state, "processing", "Önce deleted_at yazılmadı");
  t += 200; // kira doldu
  const recovered = await runArchiveExpiry(l.deps(s));
  assert.equal(recovered.notFound, 1);
  assert.equal(l.rows[0].state, "deleted");
  assert.equal(l.runs.get("r1"), "completed");
});

test("kirası biten işçi tamamlayamaz ve yeni bir dosyayı silemez", async () => {
  let t = 0;
  const l = ledger({ objects: [{ path: path(1) }, { path: path(2) }], leaseMs: 100, clock: () => t });
  const s = storage([path(1), path(2)]);
  let release;
  const gate = new Promise((r) => { release = r; });
  // A, path(1)'i silmeden önce takılır; kira dolar, B iki dosyayı da işler.
  const slow = l.deps(s, { claim: async (n) => (await l.deps(s).claim(n)).slice(0, 1) });
  const removeA = slow.remove;
  let claimed;
  const aClaimed = new Promise((r) => { claimed = r; });
  slow.remove = async (b, p) => { claimed(); await gate; return removeA(b, p); };
  const aRun = runArchiveExpiry(slow, { batch: 1, budgetMs: 1 });
  await aClaimed; // A kirayı aldı ve silmeden önce takıldı
  t += 200;
  const b = await runArchiveExpiry(l.deps(s));
  release();
  const a = await aRun;
  assert.equal(b.deleted + b.notFound, 2);
  assert.equal(a.lostLease, 1, "Kirayı kaybeden işçi tamamladı sayıldı.");
  assert.deepEqual(s.calls.filter((p) => p !== path(1) && p !== path(2)), [], "Manifest dışı yol silindi.");
  assert.equal(l.audits.length, 2, "Silme kaydı yinelendi.");
});

test("bozuk kapsam: başka depo ya da beklenmeyen yol silinmez", async () => {
  const l = ledger({ objects: [{ path: "logos/topluluk/x.webp" }, { path: path(1), bucket: "logos" }] });
  const s = storage(["logos/topluluk/x.webp", path(1)]);
  const result = await runArchiveExpiry(l.deps(s));
  assert.deepEqual(s.calls, []);
  assert.equal(result.failed, 2);
});

test("bir etkinliğin hazırlık hatası diğerlerini durdurmaz", async () => {
  const l = ledger({ objects: [] });
  const done = [];
  const result = await runArchiveExpiry(l.deps(storage([]), {
    dueEvents: async () => ["kotu", "iyi"],
    prepare: async (e) => { if (e === "kotu") throw new Error("SAKLAMA: Kapsam dışı arşiv yolu"); done.push(e); return "r"; },
  }));
  assert.deepEqual(done, ["iyi"]);
  assert.equal(result.prepareErrors.length, 1);
});
