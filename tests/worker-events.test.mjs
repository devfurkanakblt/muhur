import assert from "node:assert/strict";
import test from "node:test";
import { tick } from "@/lib/freeze";

test("İşçi iki açık etkinliği işler; birinin sağlık hatası diğerini durdurmaz", async t => {
  const saved = { NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://worker-fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-key";
  t.after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const now = Date.now();
  const event = (id, left, locked = false) => ({ id, slug: id, title: id, starts_at: new Date(now - 3600_000).toISOString(),
    deadline: new Date(now + left).toISOString(), locked_at: locked ? new Date(now - 1000).toISOString() : null,
    community: { telegram_enabled: false } });
  const events = [event("later", 120_000), event("first", 60_000), event("closed", -1000, true)];
  const health = [];
  let stored;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.hostname, "worker-fixture.invalid", "Test dış servise çıkamaz.");
    const body = init?.body ? JSON.parse(init.body) : null;
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (url.pathname.endsWith("/rpc/try_worker_lease")) return reply(body.p_name !== "depo-temizligi");
    if (url.pathname.endsWith("/rpc/claim_delivery_jobs")) return reply([]);
    if (url.pathname.endsWith("/rpc/lock_delivery_event")) return reply(false);
    if (url.pathname.endsWith("/rpc/enqueue_seals")) return reply(null);
    if (url.pathname.endsWith("/worker_runs")) {
      if (init?.method === "PATCH") { stored = body; return reply(null); }
      return reply({ id: "test-run" });
    }
    if (url.pathname.endsWith("/events")) {
      assert.ok(!url.searchParams.get("select").includes("is_current"));
      const id = url.searchParams.get("id")?.slice(3);
      return reply(id ? events.find(e => e.id === id) : events);
    }
    if (url.pathname.endsWith("/projects")) {
      const id = url.searchParams.get("event_id")?.slice(3);
      if (url.searchParams.has("or")) {
        health.push(id);
        if (id === "first") return reply({ message: "Örnek sağlık okuma hatası", code: "XX000" }, 400);
      }
      return reply([]);
    }
    if (url.pathname.endsWith("/snapshots")) return reply([]);
    throw new Error(`Beklenmeyen istek: ${url}`);
  });
  const result = await tick();
  assert.deepEqual(health, ["first", "later"], "Her iki açık etkinlik son teslim sırasıyla işlenmeli.");
  assert.deepEqual(Object.keys(result.details.open), ["first", "later"]);
  assert.equal(result.details.open.later.health.checked, 0);
  assert.equal(result.details.open.first.snapshots.attempted, 0);
  assert.ok(result.errors.some(e => e.includes("sağlık first") && e.includes("Örnek sağlık okuma hatası")));
  assert.ok(stored.error.includes("sağlık first"), "Hata etkinlik adıyla işçi kaydına yazılmalı.");
});
