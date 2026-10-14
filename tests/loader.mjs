import { readFile } from "node:fs/promises";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

const ROOT = new URL("../", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  // Sunucu modülleri de sınanabilsin: "@/..." proje kökünden çözülür, "server-only" testte boş modüldür.
  if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
  if (specifier.startsWith("@/")) specifier = new URL(specifier.slice(2), ROOT).href;
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if (/^(\.|file:)/.test(specifier) && !/\.[a-z]+$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts")) {
    const source = await readFile(new URL(url), "utf8");
    const result = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } });
    return { format: "module", shortCircuit: true, source: result.outputText };
  }
  return nextLoad(url, context);
}
