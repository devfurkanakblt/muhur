import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_REAUTH_MS, claimDecision, githubIdentity, isFreshSignIn, sessionSignedInAt } from "../lib/identity.ts";

const ADMIN_ID = "1001";
const githubUser = (overrides = {}) => ({
  id: "uuid-1",
  user_metadata: { user_name: "saldirgan" },
  identities: [{ provider: "github", id: "2002", identity_data: { provider_id: "2002", user_name: "saldirgan", avatar_url: "https://x/a.png" } }],
  ...overrides,
});

test("A01: githubIdentity user_metadata'yı yok sayar; kimlik yalnızca GitHub identity kaydından okunur", () => {
  const user = githubUser({ user_metadata: { user_name: "devfurkanakblt", preferred_username: "devfurkanakblt", provider_id: ADMIN_ID, avatar_url: "https://saldirgan/x.png" } });
  const identity = githubIdentity(user);
  assert.equal(identity.githubId, "2002");
  assert.equal(identity.login, "saldirgan");
  assert.equal(identity.avatarUrl, "https://x/a.png");
});

test("A01: kullanıcı adı değişse de kimlik sabit GitHub kimliğidir", () => {
  const renamed = githubUser({ identities: [{ provider: "github", identity_data: { provider_id: ADMIN_ID, user_name: "yeni-ad" } }] });
  assert.deepEqual(githubIdentity(renamed), { githubId: ADMIN_ID, login: "yeni-ad", avatarUrl: null });
});

test("A01: GitHub kimliği olmayan (başka sağlayıcı) hesap kimlik almaz", () => {
  const emailUser = { id: "uuid-2", user_metadata: { user_name: "devfurkanakblt" }, identities: [{ provider: "email", id: "uuid-2", identity_data: { sub: ADMIN_ID } }] };
  assert.equal(githubIdentity(emailUser), null);
  assert.equal(githubIdentity({ id: "uuid-3", identities: [] }), null);
});

test("A02: repo sahipliği sabit kimlikle; kullanıcı adı eşleşmesi tek başına izin vermez", () => {
  assert.equal(claimDecision({ ownerId: 2002, githubId: "2002" }), "owner");
  assert.equal(claimDecision({ ownerId: 3003, githubId: "2002" }), "token-required");
  assert.equal(claimDecision({ ownerId: 3003, githubId: "2002", tokenUserId: 2002, tokenCanPush: true }), "collaborator");
  assert.equal(claimDecision({ ownerId: 3003, githubId: "2002", tokenUserId: 2002, tokenCanPush: false }), "denied");
});

test("A02: başka bir hesaba ait token sahiplik kanıtı sayılmaz", () => {
  assert.equal(claimDecision({ ownerId: 3003, githubId: "2002", tokenUserId: 3003, tokenCanPush: true }), "denied");
});

test("A21: oturumun açılış zamanı yalnızca amr içindeki OAuth kaydından okunur", () => {
  assert.equal(sessionSignedInAt([{ method: "oauth", timestamp: 1_800_000_000 }]), 1_800_000_000_000);
  assert.equal(sessionSignedInAt([{ method: "oauth", timestamp: 10 }, { method: "oauth", timestamp: 20 }]), 20_000);
  assert.equal(sessionSignedInAt([{ method: "password", timestamp: 1_800_000_000 }]), null);
  assert.equal(sessionSignedInAt(["oauth"]), null);
  assert.equal(sessionSignedInAt([{ method: "oauth", timestamp: "1800000000" }]), null);
  assert.equal(sessionSignedInAt(undefined), null);
});

test("A21: geri alınamaz yönetim işlemi 12 saatten eski ya da zamanı bilinmeyen oturumla yapılamaz", () => {
  const now = Date.UTC(2026, 10, 7, 16, 55);
  assert.equal(isFreshSignIn(now - 60_000, now), true);
  assert.equal(isFreshSignIn(now - ADMIN_REAUTH_MS + 60_000, now), true);
  assert.equal(isFreshSignIn(now - ADMIN_REAUTH_MS, now), false);
  assert.equal(isFreshSignIn(null, now), false);
  assert.equal(isFreshSignIn(now + 3600_000, now), false);
});
