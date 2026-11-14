import test from "node:test";
import assert from "node:assert/strict";
import { certificateName, cleanNamePart, dateRangeTR, fileSlug } from "../lib/certificate.ts";

test("ad ve soyad temizlenip birleştirilir", () => {
  assert.equal(certificateName("  Çağrı ", " Öztürk  "), "Çağrı Öztürk");
  assert.equal(certificateName("Ayşe   Nur", "Yılmaz-Kaya"), "Ayşe Nur Yılmaz-Kaya");
  assert.equal(certificateName("Can", "O'Neil"), "Can O'Neil");
});

test("boş, çok uzun ya da harf dışı içerik reddedilir", () => {
  assert.equal(certificateName("", "Yılmaz"), null);
  assert.equal(certificateName("Ali", "   "), null);
  assert.equal(cleanNamePart("<script>"), null);
  assert.equal(cleanNamePart("Ali1"), null);
  assert.equal(cleanNamePart("-Ali"), null);
  assert.equal(cleanNamePart("a".repeat(41)), null);
  assert.equal(cleanNamePart(undefined), null);
});

test("tarih aralığı Türkiye saatine göre kısaltılır", () => {
  assert.equal(dateRangeTR("2026-11-07T07:00:00Z", "2026-11-08T07:00:00Z"), "7–8 Kasım 2026");
  assert.equal(dateRangeTR("2026-10-31T07:00:00Z", "2026-11-01T07:00:00Z"), "31 Ekim – 1 Kasım 2026");
  assert.equal(dateRangeTR("2026-11-07T07:00:00Z", "2026-11-07T20:00:00Z"), "7 Kasım 2026");
});

test("dosya adı ASCII'ye çevrilir", () => {
  assert.equal(fileSlug("Çağrı Işık Öztürk"), "cagri-isik-ozturk");
  assert.equal(fileSlug("İlkay Şen"), "ilkay-sen");
});
