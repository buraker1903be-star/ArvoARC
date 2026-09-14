import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
  eslint-config-next 16 doğrudan "flat config" dışa aktarıyor.
  Eskiden FlatCompat köprüsüyle yükleniyordu; köprü yeni yapıyı
  eski .eslintrc biçimine çevirmeye çalışıp "Converting circular
  structure to JSON" hatasıyla çöküyor, lint hiç çalışmıyordu.
*/
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "node_modules/**", "next-env.d.ts"]),
]);
