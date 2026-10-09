import test from "node:test";
import assert from "node:assert/strict";
import { claimDecision, githubIdentity, isAdminIdentity } from "../lib/identity.ts";

const ADMIN_ID = "1001";
const githubUser = (overrides = {}) => ({
  id: "uuid-1",
  user_metadata: { user_name: "saldirgan" },
  identities: [{ provider: "github", id: "2002", identity_data: { provider_id: "2002", user_name: "saldirgan", avatar_url: "https://x/a.png" } }],
  ...overrides,
});

test("A01: user_metadata kullanıcı adını yönetici adıyla değiştirmek yetki vermez", () => {
  const user = githubUser({ user_metadata: { user_name: "devfurkanakblt", preferred_username: "devfurkanakblt", provider_id: ADMIN_ID } });
  const identity = githubIdentity(user);
  assert.equal(identity.githubId, "2002");
  assert.equal(identity.login, "saldirgan");
  assert.equal(isAdminIdentity(identity, [ADMIN_ID]), false);
});

test("A01: yönetici yalnızca sabit GitHub kimliğiyle tanınır; kullanıcı adı değişse de yetki sürer", () => {
  const admin = githubUser({ identities: [{ provider: "github", identity_data: { provider_id: ADMIN_ID, user_name: "yeni-ad" } }] });
  assert.equal(isAdminIdentity(githubIdentity(admin), [ADMIN_ID]), true);
});

test("A01: GitHub kimliği olmayan (başka sağlayıcı) hesap kimlik ve yetki almaz", () => {
  const emailUser = { id: "uuid-2", user_metadata: { user_name: "devfurkanakblt" }, identities: [{ provider: "email", id: "uuid-2", identity_data: { sub: ADMIN_ID } }] };
  assert.equal(githubIdentity(emailUser), null);
  assert.equal(isAdminIdentity(githubIdentity(emailUser), [ADMIN_ID]), false);
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
