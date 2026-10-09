import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logoSizeError, readImageSize } from "../lib/logo-spec.ts";

// Gerçek dosyaları bağımsız bir araçla (Python Pillow) üret; böylece başlık okuyucu kendi kendini doğrulamaz.
const dir = mkdtempSync(join(tmpdir(), "logo-"));
function make(name, w, h, format, extra = "") {
  const path = join(dir, name);
  execFileSync("python", ["-c", `from PIL import Image; Image.new("RGBA" if "${format}" != "JPEG" else "RGB", (${w}, ${h}), (74, 54, 207)).save(r"${path}", "${format}"${extra})`]);
  return new Uint8Array(readFileSync(path));
}

test("PNG, JPEG ve WEBP (kayıplı, kayıpsız) boyutları başlıktan okunur", () => {
  assert.deepEqual(readImageSize(make("a.png", 512, 512, "PNG")), { width: 512, height: 512 });
  assert.deepEqual(readImageSize(make("b.jpg", 640, 480, "JPEG")), { width: 640, height: 480 });
  assert.deepEqual(readImageSize(make("c.webp", 700, 512, "WEBP", ", lossless=False")), { width: 700, height: 512 });
  assert.deepEqual(readImageSize(make("d.webp", 1024, 1000, "WEBP", ", lossless=True")), { width: 1024, height: 1000 });
  assert.equal(readImageSize(new TextEncoder().encode("<svg></svg>")), null);
});

test("logo kuralı: kare, 512–2048 px, küçük yuvarlama payına izin", () => {
  assert.equal(logoSizeError(512, 512), null);
  assert.equal(logoSizeError(1024, 1023), null);
  assert.match(logoSizeError(800, 400), /kare/);
  assert.match(logoSizeError(256, 256), /en az 512/);
  assert.match(logoSizeError(4096, 4096), /en fazla 2048/);
  assert.match(logoSizeError(0, 0), /okunamadı/);
});

test("A14: sunucu logoyu gerçekten çözer; başlığı taklit eden dosya ve tür uyuşmazlığı reddedilir", async () => {
  const { normalizeLogo } = await import("../lib/logo-image.ts");
  const png = make("ok.png", 600, 600, "PNG");
  const ok = await normalizeLogo(png, "image/png");
  assert.equal(typeof ok, "object");
  assert.deepEqual([ok.width, ok.height, ok.type, ok.ext], [600, 600, "image/png", "png"]);

  // 24 baytlık sahte PNG: imza + IHDR başlığı 512×512 diyor, piksel verisi yok.
  const fake = new Uint8Array(24);
  fake.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 2, 0, 0, 0, 2, 0]);
  assert.deepEqual(readImageSize(fake), { width: 512, height: 512 });
  assert.match(await normalizeLogo(fake, "image/png"), /açılamadı/);

  assert.match(await normalizeLogo(make("j.jpg", 600, 600, "JPEG"), "image/png"), /uyuşmuyor/);
  assert.match(await normalizeLogo(make("small.png", 256, 256, "PNG"), "image/png"), /en az 512/);
  assert.match(await normalizeLogo(new TextEncoder().encode("<svg></svg>"), "image/svg+xml"), /PNG, JPG ya da WEBP/);
});
