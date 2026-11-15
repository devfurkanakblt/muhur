import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { policyHash } from "../lib/policy-hash.ts";
import { normalizePolicyText, policyDraftError, policyPath, policyKindFromSlug, checked, documentIds, safeConsentNext, consentError } from "../lib/policies.ts";

test("normalleştirme: BOM atılır, satır sonları LF, NFC", () => {
  assert.equal(normalizePolicyText("﻿a\r\nb\rc"), "a\nb\nc");
  assert.equal(normalizePolicyText("Café"), "Café");
  assert.equal(normalizePolicyText(normalizePolicyText("x\r\n")), "x\n");
});

test("hash gösterilen metnin UTF-8 baytlarından ve SQL ile aynı", () => {
  const text = "Platform sözleşmesi\nSürüm 1";
  assert.equal(policyHash(text), createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex"));
  assert.notEqual(policyHash(text), policyHash(`${text} `), "değiştirilmiş metin aynı hash'i vermez");
  assert.match(policyHash(""), /^[a-f0-9]{64}$/);
});

test("taslak doğrulaması tür, sürüm ve normalleştirmeyi denetler", () => {
  assert.equal(policyDraftError("platform", "2026-11", "Metin"), null);
  assert.match(policyDraftError("baska", "v1", "Metin"), /tür/);
  assert.match(policyDraftError("platform", "../v1", "Metin"), /Sürüm/);
  assert.match(policyDraftError("platform", "v1", "  "), /boş/);
  assert.match(policyDraftError("platform", "v1", "a\r\nb"), /normalleştirilmemiş/);
});

test("belge adresleri değişmez ve türden geri çözülür", () => {
  assert.equal(policyPath("data_processing", "2026.1"), "/kosullar/veri-isleme/2026.1");
  assert.equal(policyPath("participant", "a b"), "/kosullar/katilimci/a%20b");
  assert.equal(policyKindFromSlug("katilimci"), "participant");
  assert.equal(policyKindFromSlug("data_processing"), null);
});

test("yalnız işaretlenmiş checkbox onaydır; belge kimliği onay sayılmaz", () => {
  const form = new FormData();
  form.set("accept_platform", "on");
  form.set("accept_rules", "true");
  form.set("participant_document", "11111111-1111-1111-1111-111111111111");
  assert.equal(checked(form, "accept_platform"), true);
  assert.equal(checked(form, "accept_rules"), false);
  assert.equal(checked(form, "accept_participant"), false);
});

test("belge kimlikleri tekilleşir; bozuk değer bütün listeyi geçersiz kılar", () => {
  const a = "11111111-1111-1111-1111-111111111111", b = "22222222-2222-2222-2222-222222222222";
  assert.deepEqual(documentIds([a, b, a.toUpperCase()]), [a, b]);
  assert.equal(documentIds([a, "x"]), null);
  assert.equal(documentIds([]), null);
});

test("onay sonrası dönüş: yalnız aynı site, döngü yok", () => {
  assert.equal(safeConsentNext("/e/bahar/yonetim?x=1#a", "/f"), "/e/bahar/yonetim?x=1#a");
  for (const bad of ["https://evil.test/", "//evil.test", "/\\evil.test", "javascript:alert(1)", "", null, "/topluluk/deu/onay", "/topluluk/deu/onay/"]) {
    assert.equal(safeConsentNext(bad, "/f"), "/f", String(bad));
  }
});

test("ONAY öneki kullanıcı mesajına çevrilir", () => {
  assert.equal(consentError("ONAY: Güncel platform belgelerini onaylaman gerekiyor.\nCONTEXT: x"), "Güncel platform belgelerini onaylaman gerekiyor.");
  assert.equal(consentError("YETKI: yok"), null);
});

test("betik: hazırlık normalleştirir, uyarır ve hatalı türü reddeder", async () => {
  const { preparePolicy } = await import("../scripts/publish-policy.mjs");
  const ok = preparePolicy("platform", "2026-12", "﻿Metin\r\nİkinci satır");
  assert.equal(ok.text, "Metin\nİkinci satır");
  assert.equal(ok.sha256, policyHash("Metin\nİkinci satır"));
  assert.ok(ok.warnings.some(w => /normalleştirildi/.test(w)));
  assert.ok(preparePolicy("platform", "v1", "Örnek sözleşme").warnings.some(w => /taslak\/örnek/.test(w)));
  assert.match(preparePolicy("baska", "v1", "Metin").error, /tür/);
});
