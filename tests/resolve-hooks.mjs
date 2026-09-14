import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** "@/lib/x" → src/lib/x; uzantısız göreli yol → .ts dosyası. */
export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (target.startsWith("@/")) target = pathToFileURL(path.join(root, "src", target.slice(2))).href;

  const local = target.startsWith("./") || target.startsWith("../") || target.startsWith("file:");
  if (local && !/\.[cm]?[jt]sx?$/.test(target)) {
    const base = target.startsWith("file:") ? fileURLToPath(target) : fileURLToPath(new URL(target, context.parentURL));
    for (const suffix of [".ts", "/index.ts"]) {
      if (existsSync(base + suffix)) return nextResolve(pathToFileURL(base + suffix).href, context);
    }
  }
  return nextResolve(target, context);
}
