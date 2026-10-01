/**
 * Copia el worker de MapLibre a public/maplibre/ con sus nombres originales.
 *
 * Por qué: el worker (maplibre-gl-worker.mjs) importa "./maplibre-gl-shared.mjs"
 * por ruta relativa, pero el bundler publica ese archivo con un nombre con hash,
 * así que el worker no lo encuentra y el mapa no dibuja las teselas. Servidos
 * desde /maplibre/ con sus nombres, la importación relativa funciona.
 *
 * Se ejecuta antes de dev y build (predev/prebuild), por lo que siempre
 * corresponde a la versión instalada de maplibre-gl. public/maplibre/ no se
 * versiona.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/package.json"));
const target = path.resolve(import.meta.dirname, "../public/maplibre");

mkdirSync(target, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(dist, "dist", file), path.join(target, file));
}
console.log("maplibre: worker copiado a public/maplibre/");
