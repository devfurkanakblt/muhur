import test from "node:test";
import assert from "node:assert/strict";
import { accentTokens, accentVariables, checkAccent, contrast, DEFAULT_ACCENT, deriveDark, lightReadable, normalizeHex, THEME, tokenPairs } from "../lib/branding.ts";
import { ALL_OFF, defaultFeatures, featuresFromForm, FEATURE_KEYS, isMascotCommunity, parseFeatures } from "../lib/event-features.ts";

test("renk yalnız HEX olarak normalize edilir", () => {
  assert.equal(normalizeHex("#0F766E"), "#0f766e");
  assert.equal(normalizeHex(" 0f766e "), "#0f766e");
  assert.equal(normalizeHex("#abc"), "#aabbcc");
  for (const bad of ["red", "#12345", "#1234567", "url(x)", "#0f766e;background:red", "rgb(1,2,3)", "", null, 42, {}]) assert.equal(normalizeHex(bad), null, String(bad));
});

test("WCAG kontrast formülü bilinen değerleri verir", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff") * 100) / 100, 21);
  assert.equal(contrast("#777777", "#777777"), 1);
  // #767676 beyaz üstünde 4.5:1 sınırının hemen üstündeki bilinen gri.
  assert.ok(contrast("#767676", "#ffffff") >= 4.5 && contrast("#777777", "#ffffff") < 4.5);
});

test("platform rengi ve örnek tonlar iki temada bütün token çiftlerini geçer", () => {
  for (const color of [DEFAULT_ACCENT, "#0f766e", "#b4233c", "#1d4ed8", "#7c2d12", "#000000", "#666666"]) {
    const result = checkAccent(color);
    assert.equal(result.ok, true, color);
    for (const pair of tokenPairs(accentTokens(color))) {
      assert.ok(contrast(pair.fg, pair.bg) >= pair.min, `${color} · ${pair.theme} · ${pair.use}: ${contrast(pair.fg, pair.bg).toFixed(2)}`);
    }
  }
});

test("okunamayan renk reddedilir ve okunabilir en yakın öneri gösterilir; sessizce değiştirilmez", () => {
  for (const color of ["#ffff00", "#777777", "#ffffff", "#9d8fff", "#22c55e"]) {
    const result = checkAccent(color);
    assert.equal(result.ok, false, color);
    assert.match(result.error, /4\.5:1/);
    assert.ok(result.suggestion && lightReadable(result.suggestion), `${color} önerisi okunabilir olmalı`);
    assert.notEqual(result.suggestion, color);
  }
  assert.equal(checkAccent("javascript:1").ok, false);
  assert.equal(checkAccent("javascript:1").suggestion, null);
});

test("koyu ton türetimi deterministik ve koyu zeminde okunur", () => {
  for (const color of ["#4a36cf", "#0f766e", "#000000", "#1d4ed8"]) {
    const dark = deriveDark(color);
    assert.equal(deriveDark(color), dark);
    assert.ok(contrast(dark, THEME.dark.wall) >= 4.5 && contrast(dark, THEME.dark.plinth) >= 4.5, `${color} → ${dark}`);
  }
});

test("etkinlik alanı değişkenleri kök indigo'yu değil yalnız accent tokenlarını taşır; geçersiz renk platform rengine düşer", () => {
  const vars = accentVariables("#0f766e");
  assert.equal(vars["--accent-light"], "#0f766e");
  assert.ok(!Object.keys(vars).some((k) => k.includes("indigo")));
  assert.equal(accentVariables(null)["--accent-light"], DEFAULT_ACCENT);
  assert.equal(accentVariables("#ffff00")["--accent-light"], DEFAULT_ACCENT);
  // İki farklı etkinliğin değişkenleri birbirinden bağımsızdır.
  assert.notEqual(accentVariables("#0f766e")["--accent-dark"], accentVariables("#b4233c")["--accent-dark"]);
});

test("varsayılan özellikler topluluktan; DEÜ dışında kapalı", () => {
  assert.deepEqual(defaultFeatures("deu-csai"), { public_voting: true, mystery_hunt: true, easter_eggs: true, mascot_naming: true });
  assert.deepEqual(defaultFeatures("baska"), ALL_OFF);
  assert.deepEqual(defaultFeatures(null, false), defaultFeatures("deu-csai"));
  assert.equal(isMascotCommunity("baska"), false);
});

test("özellik okuması fail-closed; maskot bayrağı başka toplulukta açılamaz", () => {
  assert.deepEqual(parseFeatures(null, "deu-csai"), ALL_OFF);
  assert.deepEqual(parseFeatures({ public_voting: "true", mystery_hunt: 1 }, "deu-csai"), ALL_OFF);
  assert.equal(parseFeatures({ mascot_naming: true }, "baska").mascot_naming, false);
  assert.equal(parseFeatures({ mascot_naming: true }, "deu-csai").mascot_naming, true);
  assert.deepEqual(Object.keys(parseFeatures({ public_voting: true, extra: true }, "baska")).sort(), [...FEATURE_KEYS].sort());
});

test("form: yalnız izinli kutular okunur; istemcinin 'isDeu' gibi alanı etkisizdir", () => {
  const form = new FormData();
  form.set("feature_public_voting", "on");
  form.set("feature_extra", "on");
  form.set("isDeu", "true");
  assert.deepEqual(featuresFromForm(form), { ...ALL_OFF, public_voting: true });
});
