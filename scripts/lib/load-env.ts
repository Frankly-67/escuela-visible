/**
 * Carga .env.local para los scripts (fuera de Next.js).
 * Debe ser el PRIMER import de cada script: los módulos de src/lib leen
 * process.env al cargarse.
 *
 * Usa process.loadEnvFile (Node ≥ 20.12) para no depender de @next/env.
 * Las variables ya definidas en el entorno tienen prioridad.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const envFile = path.resolve(import.meta.dirname, "../../.env.local");

if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
} else {
  console.warn("Aviso: no existe .env.local; se usan solo las variables del entorno.");
}
