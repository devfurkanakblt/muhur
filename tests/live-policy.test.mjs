import test from "node:test";
import assert from "node:assert/strict";
import { FormChanges, synchronizedTime } from "../lib/live-policy.ts";
import { serverTimeAt } from "../lib/delivery-policy.ts";

test("bir formun kaydı diğer formun taslağını temizlemez", () => {
  const forms = new FormChanges();
  forms.edit("schedule"); forms.edit("announcement");
  forms.saved("schedule", forms.revision("schedule"));
  assert.equal(forms.hasChanges(), true);
  forms.saved("announcement", forms.revision("announcement"));
  assert.equal(forms.hasChanges(), false);
});

test("gönderim sürerken yazılan yeni alanlar önceki başarıyla temizlenmez", () => {
  const forms = new FormChanges();
  forms.edit("project");
  const submitted = forms.revision("project");
  forms.edit("project");
  forms.saved("project", submitted);
  assert.equal(forms.hasChanges(), true);
  forms.saved("project", forms.revision("project"));
  assert.equal(forms.hasChanges(), false);
});

test("iptal sadece ilgili formu; sayfadan kaldırma sadece kaldırılmış formları temizler", () => {
  const forms = new FormChanges();
  forms.edit("first"); forms.edit("second");
  forms.discard("first");
  assert.equal(forms.hasChanges(), true);
  forms.prune(form => form !== "second");
  assert.equal(forms.hasChanges(), false);
});

test("sunucu zamanı değişmeyen sürümde de ağ gecikmesiyle eşitlenebilir", () => {
  const anchor = synchronizedTime(1000000, 100, 500);
  assert.equal(serverTimeAt(anchor.serverNow, anchor.reference, 1500), 1001200);
  const fresh = synchronizedTime(1010000, 2100, 2500);
  assert.equal(serverTimeAt(fresh.serverNow, fresh.reference, 3500), 1011200);
});

test("kaydedilecek alan olmasa bile devam eden işlem yenilemeyi bekletir", () => {
  const forms = new FormChanges();
  forms.begin("voting");
  assert.equal(forms.hasChanges(), true);
  assert.equal(forms.hasPending(), true);
  forms.discard("voting");
  assert.equal(forms.hasChanges(), true);
  forms.finish("voting");
  assert.equal(forms.hasChanges(), false);
});
