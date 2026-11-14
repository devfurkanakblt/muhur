import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Açılış videosu: kendi bağımlılıkları ve tsconfig'i olan ayrı Remotion projesi.
    "video/**",
    // Ben kimim? oyunu: ayrı Next.js sitesi, kendi bağımlılıkları ve tsconfig'i var.
    "ben-kimim/**",
  ]),
]);

export default eslintConfig;
