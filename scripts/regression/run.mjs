// Ejecuta un grupo de regresiones en secuencia y resume el resultado.
//   node scripts/regression/run.mjs pglite      → PGlite (offline)
//   node scripts/regression/run.mjs regression  → datos reales SOLO LECTURA (sin servidor)
//   node scripts/regression/run.mjs http        → HTTP SOLO LECTURA contra un servidor local
// Ver docs/REGRESIONES.md. Ningún grupo escribe en Supabase ni publica en Hedera.
import { spawnSync } from "node:child_process";
import path from "node:path";

import { ROOT } from "./lib/env.mjs";

const TSX = ["--import", "tsx", "--no-warnings"];
const SERVER = [...TSX, "--conditions=react-server"];
const MOCKS = [...SERVER, "--experimental-test-module-mocks"];

const GROUPS = {
  pglite: [
    ["pglite/flow.mts", TSX],
    ["pglite/column-privacy-b0.mts", TSX],
    ["pglite/column-privacy-b01.mts", TSX],
    ["pglite/panel-isolation-b1.mts", TSX],
    ["pglite/board.mts", TSX],
  ],
  regression: [
    ["state.mts", SERVER],
    ["data-layer.mts", MOCKS],
    ["actions-needs.mts", MOCKS],
    ["actions-support.mts", MOCKS],
    ["actions-board.mts", MOCKS],
  ],
  http: [
    ["http-public.mjs", []],
    ["http-panels.mjs", []],
    ["http-need-actions.mjs", []],
    ["http-support-actions.mjs", []],
    ["http-board.mjs", []],
  ],
};

const group = process.argv[2];
if (!GROUPS[group]) {
  console.error(`Grupo desconocido. Usa: ${Object.keys(GROUPS).join(" | ")}`);
  process.exit(2);
}

const results = [];
for (const [file, flags] of GROUPS[group]) {
  console.log(`\n═══ ${file}`);
  const run = spawnSync(process.execPath, [...flags, path.join("scripts", "regression", file)], { cwd: ROOT, stdio: "inherit" });
  results.push([file, run.status === 0]);
}

console.log(`\n═══ Resumen (${group})`);
for (const [file, passed] of results) console.log(`${passed ? "✓" : "✗"} ${file}`);
const ok = results.every(([, passed]) => passed);
console.log(ok ? "TODO OK" : "HAY FALLOS");
process.exitCode = ok ? 0 : 1;
