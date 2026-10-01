/**
 * Carga .env.local (si existe) para los scripts .mjs de regresión, igual que
 * scripts/lib/load-env.ts para los .ts. Las variables ya definidas en el
 * entorno tienen prioridad. Nunca imprime valores.
 */
import { existsSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../../..");

let loaded = false;
export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const envFile = path.join(ROOT, ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}
