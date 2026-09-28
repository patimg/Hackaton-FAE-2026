import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals, ...nextTypescript,
  globalIgnores([".next/**", ".tools/**", ".data/**", ".verification/**", "next-env.d.ts", "playwright-report/**", "test-results/**", "supabase/.temp/**"]),
]);
