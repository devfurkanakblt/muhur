import test from "node:test";
import assert from "node:assert/strict";
import { encryptMailSecret, decryptMailSecret } from "@/lib/mail/secrets";
import { renderMail } from "@/lib/mail/templates";
import { sendBrevo } from "@/lib/mail/brevo";
import { validBearer, mailEvents } from "@/lib/mail/webhook";
import { newInviteToken, inviteHash } from "@/lib/role-invites";
import { communityFields, httpsLink } from "@/lib/community-input";

const key = Buffer.alloc(32, 17).toString("base64");
test("Davet: 256 bit token, yalnız hash ve kimliği doğrulanan şifreli yük", () => {
  const token = newInviteToken(); assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, newInviteToken()); assert.match(inviteHash(token), /^[a-f0-9]{64}$/);
  const payload = encryptMailSecret({ token }, key);
  assert.ok(!payload.includes(token)); assert.deepEqual(decryptMailSecret(payload, key), { token });
  assert.notEqual(payload, encryptMailSecret({ token }, key));
  assert.throws(() => decryptMailSecret(payload, Buffer.alloc(32, 18).toString("base64")));
  const tampered = JSON.parse(payload); tampered.data = Buffer.alloc(60).toString("base64");
  assert.throws(() => decryptMailSecret(JSON.stringify(tampered), key));
  assert.throws(() => decryptMailSecret("x".repeat(8193), key));
  assert.throws(() => encryptMailSecret({ token }, "invalid"));
});
test("E-posta: kullanıcı metni escape edilir, bağlantı güvenilir köktedir", () => {
  const rendered = renderMail({ kind: "application_rejected", payload: { name: '<img src=x onerror="alert(1)">', reason: "<script>test</script>" } }, "https://muhur.test");
  assert.ok(!rendered.htmlContent.includes("<script>")); assert.ok(rendered.htmlContent.includes("&lt;img"));
  assert.ok(rendered.textContent.includes("https://muhur.test/topluluk/basvurularim"));
  assert.throws(() => renderMail({ kind: "jury_invite", payload: {} }, "https://muhur.test"));
  const invite = renderMail({ kind: "jury_invite", payload: { name: "Etkinlik" } }, "https://muhur.test", "a".repeat(43));
  assert.ok(invite.textContent.includes("https://muhur.test/katil/"));
});
test("Brevo: 201, 400, 429, 5xx, timeout ve belirsiz başarı ayrı ele alınır", async t => {
  const config = { apiKey: "fake-key", from: "sender@example.test", fromName: "mühür" };
  const input = { id: "test-job", to: "recipient@example.test", subject: "Test", textContent: "Test", htmlContent: "<p>Test</p>" };
  let request;
  t.mock.method(globalThis, "fetch", async (url, init) => { request = { url, init }; return Response.json({ messageId: "provider-1" }, { status: 201 }); });
  assert.deepEqual(await sendBrevo(input, config), { state: "accepted", messageId: "provider-1" });
  assert.equal(request.init.headers["api-key"], "fake-key");
  assert.equal(JSON.parse(request.init.body).headers.IdempotencyKey, input.id);
  for (const [status, state] of [[400,"dead"],[401,"dead"],[429,"pending"],[503,"uncertain"],[408,"uncertain"]]) {
    globalThis.fetch = async () => new Response("PRIVATE PROVIDER DETAILS", { status, headers: { "retry-after": "123" } });
    const outcome = await sendBrevo(input, config); assert.equal(outcome.state, state);
    assert.ok(!outcome.error.includes("PRIVATE")); if (status === 429) assert.equal(outcome.retryAfter,123);
  }
  globalThis.fetch = async () => { throw new Error("PRIVATE NETWORK DETAILS"); };
  assert.equal((await sendBrevo(input, config)).state, "uncertain");
  globalThis.fetch = async () => Response.json({}); assert.equal((await sendBrevo(input, config)).state,"uncertain");
});
test("Webhook: bearer sabit zamanda doğrulanır, olay ID tek başına tekillik sayılmaz", () => {
  assert.equal(validBearer("Bearer correct", "correct"), true);
  for (const header of [null, "Bearer wrong", "correct", "bearer correct"]) assert.equal(validBearer(header, "correct"), false);
  assert.equal(validBearer("Bearer undefined", undefined), false);
  const raw = { id: 1, "message-id": "message-1", event: "delivered", ts_event: 1700000000, email: "A@example.test" };
  const first = mailEvents(raw)[0]; assert.deepEqual(mailEvents({ ...raw, id: 500 })[0], first);
  assert.notEqual(mailEvents({ ...raw, event: "sent" })[0].p_key, first.p_key);
  assert.deepEqual(mailEvents({ ...raw, event: "opened" }), []);
  assert.equal(mailEvents({ ...raw, ts_epoch: 1700000000000 })[0].p_key, first.p_key);
  assert.throws(() => mailEvents(Array(51).fill(raw)));
  assert.throws(() => mailEvents({ ...raw, "message-id": "" }));
  assert.throws(() => mailEvents({ ...raw, ts_event: -1 }));
});
test("Başvuru: HTTPS adresi ve alan sınırları sunucuda doğrulanır", () => {
  assert.equal(httpsLink("https://example.test/path"),"https://example.test/path");
  for (const input of ["http://example.test", "javascript:alert(1)", "https://user:pass@example.test"]) assert.throws(() => httpsLink(input));
  const form = new FormData(); assert.throws(() => communityFields(form));
});

test("İşçi: geçersiz davet gönderilmez; lease kaybında kör tekrar yok", async () => {
  const { runMailWorker } = await import("@/lib/mail/worker");
  const names = ["BREVO_API_KEY","BREVO_FROM_EMAIL","MAIL_PAYLOAD_KEY"]; const saved = names.map(n => process.env[n]);
  try {
    process.env.BREVO_API_KEY="fake"; process.env.BREVO_FROM_EMAIL="sender@example.test"; process.env.MAIL_PAYLOAD_KEY=key;
    const job={ id:"job-1",kind:"jury_invite",payload:{name:"Test"},recipient_email:"test@example.test",lease_token:"lease",secret_payload:encryptMailSecret({token:"a".repeat(43)},key) };
    let claimed=false, sends=0; const finishes=[];
    const db={ rpc:async (name,args)=> {
      if(name==="claim_mail_jobs") { const data=claimed?[]:[job]; claimed=true; return {data}; }
      if(name==="mail_job_ready") return {data:false};
      finishes.push(args); return {data:true};
    }};
    const send=async()=> { sends++; return {state:"accepted",messageId:"message-1"}; };
    assert.equal((await runMailWorker({db,send})).processed,1); assert.equal(sends,0); assert.equal(finishes[0].p_state,"cancelled");
    claimed=false; db.rpc=async(name)=>{
      if(name==="claim_mail_jobs") { const data=claimed?[]:[job]; claimed=true; return {data}; }
      if(name==="mail_job_ready") return {data:true}; return {data:false};
    };
    await assert.rejects(runMailWorker({db,send}),/otomatik tekrar/); assert.equal(sends,1);
    claimed=false; job.secret_payload="broken";
    db.rpc=async(name,args)=>{
      if(name==="claim_mail_jobs") { const data=claimed?[]:[job]; claimed=true; return {data}; }
      if(name==="mail_job_ready") return {data:true}; finishes.push(args); return {data:true};
    };
    await runMailWorker({db,send}); assert.equal(sends,1); assert.equal(finishes.at(-1).p_state,"dead");
    delete process.env.BREVO_API_KEY;
    assert.deepEqual(await runMailWorker({db,send}),{configured:false,processed:0});
  } finally { names.forEach((n,i)=>{ if(saved[i]===undefined) delete process.env[n]; else process.env[n]=saved[i]; }); }
});
