import test from "node:test";
import assert from "node:assert/strict";
import { verifiedIdentity } from "@/lib/identity";
import { safeAuthNext } from "@/lib/auth-redirect";

test("LinkedIn: kimlik metadata değil doğrulanmış identity kaydından gelir", () => {
  const user = { user_metadata: { user_name: "head-admin", sub: "fake" }, identities: [{ provider: "linkedin_oidc", identity_data: { sub: "li-123", name: "Jüri Üyesi", picture: "https://example.com/a" } }] };
  assert.deepEqual(verifiedIdentity(user), { provider: "linkedin", githubId: null, subject: "li-123", login: "Jüri Üyesi", avatarUrl: "https://example.com/a" });
  assert.equal(verifiedIdentity({ identities: [{ provider: "email", id: "42" }] }), null);
  assert.equal(verifiedIdentity({ user_metadata: user.user_metadata }), null);
});
test("Bağlı identity GitHub yeteneğini korur; email eşitliği rol vermez", () => {
  const who = verifiedIdentity({ identities: [{ provider: "linkedin_oidc", id: "li" }, { provider: "github", identity_data: { provider_id: 42, user_name: "renamed" } }] });
  assert.equal(who.githubId, "42"); assert.equal(who.login, "renamed");
});
test("OAuth dönüşü dış adresi, ters çizgiyi ve kontrol karakterini reddeder", () => {
  for (const value of ["https://evil.test", "//evil.test", "/\\evil", "/x\nLocation:evil", null]) assert.equal(safeAuthNext(value), "/panel");
  assert.equal(safeAuthNext("/katil/abc?x=1"), "/katil/abc?x=1");
});

test("Genel başvuru anahtarı kapalıyken sunucu eylemi oturum veya DB yazmadan reddeder", async () => {
  const previous = process.env.COMMUNITY_APPLICATIONS_ENABLED;
  try {
    process.env.COMMUNITY_APPLICATIONS_ENABLED = "false";
    const { submitApplication } = await import("@/app/topluluk/actions");
    const result = await submitApplication(undefined, new FormData());
    assert.match(result.error, /henüz açılmadı/);
  } finally { if (previous === undefined) delete process.env.COMMUNITY_APPLICATIONS_ENABLED; else process.env.COMMUNITY_APPLICATIONS_ENABLED = previous; }
});
