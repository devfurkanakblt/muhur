import test from "node:test";
import assert from "node:assert/strict";
import { findGithubUser } from "../scripts/bootstrap-head-admin.mjs";

const user = (id, ghId, login, extra = {}) => ({
  id,
  user_metadata: { user_name: "sahte" },
  identities: [{ provider: "github", id: ghId, identity_data: { provider_id: ghId, user_name: login, ...extra } }],
});

test("sayısal GitHub kimliğiyle kullanıcıyı bulur", () => {
  const users = [user("u1", "111", "a"), user("u2", "222", "bee")];
  assert.deepEqual(findGithubUser(users, "222"), { id: "u2", login: "bee" });
  assert.deepEqual(findGithubUser(users, " 111 "), { id: "u1", login: "a" });
});

test("bulunamazsa ya da kimlik sayısal değilse null", () => {
  assert.equal(findGithubUser([user("u1", "111", "a")], "999"), null);
  assert.equal(findGithubUser([user("u1", "111", "a")], "a"), null);
  assert.equal(findGithubUser([], "111"), null);
});

test("user_metadata ve başka sağlayıcı yok sayılır", () => {
  const spoof = { id: "u3", user_metadata: { provider_id: "333" }, identities: [{ provider: "google", id: "333", identity_data: { provider_id: "333" } }] };
  assert.equal(findGithubUser([spoof], "333"), null);
});

test("preferred_username yedeği kullanılır", () => {
  const u = { id: "u4", identities: [{ provider: "github", id: "444", identity_data: { sub: "444", preferred_username: "pu" } }] };
  assert.deepEqual(findGithubUser([u], "444"), { id: "u4", login: "pu" });
});
