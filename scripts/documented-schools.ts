/**
 * Registra en Supabase las escuelas de los casos reales documentados
 * (src/content/documented-cases.ts) con is_demo = false.
 *
 *   npm run cases:schools                → vista previa: SOLO LECTURA
 *   npm run cases:schools -- --confirm   → inserta las escuelas que falten
 *
 * - Solo inserta: nunca actualiza ni borra filas existentes. Si el slug ya
 *   existe, informa las diferencias y no lo toca (una escuela DEMO jamás se
 *   convierte en real desde aquí).
 * - No crea necesidades, compromisos ni eventos, y no publica nada en Hedera.
 * - La ubicación es la aproximada del contenido estático (cabecera municipal).
 * - Usa la secret key (service_role): la tabla schools no tiene políticas de escritura.
 */
import "./lib/load-env";

import { DOCUMENTED_CASES } from "@/content/documented-cases";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/types/database";

const confirm = process.argv.includes("--confirm");
const db = createAdminClient();

const rows: TablesInsert<"schools">[] = DOCUMENTED_CASES.map((c) => ({
  slug: c.slug,
  name: c.school.name,
  department: c.school.department,
  municipality: c.school.municipality,
  vereda: null,
  latitude: c.school.latitude,
  longitude: c.school.longitude,
  description: c.summary,
  students_range: null,
  cover_image_path: null,
  is_demo: false,
}));

async function main() {
  console.log(confirm ? "Modo: INSERTAR (--confirm)\n" : "Modo: vista previa (solo lectura)\n");

  let pending = 0;
  for (const row of rows) {
    const { data: existing, error } = await db
      .from("schools")
      .select("id, slug, name, department, municipality, vereda, latitude, longitude, description, is_demo")
      .eq("slug", row.slug)
      .maybeSingle();
    if (error) throw new Error(`No se pudo leer la escuela ${row.slug}: ${error.message}`);

    if (existing) {
      const diffs = (["name", "department", "municipality", "latitude", "longitude", "is_demo"] as const).filter(
        (k) => String(existing[k]) !== String(row[k]),
      );
      console.log(`= ${row.slug}: ya existe (id ${existing.id}, is_demo=${existing.is_demo}). No se modifica.`);
      if (diffs.length) console.log(`  ⚠ difiere del contenido estático en: ${diffs.join(", ")}`);
      continue;
    }

    pending++;
    console.log(`+ ${row.slug}: se insertaría`);
    console.log(`  ${JSON.stringify(row)}`);
    if (!confirm) continue;

    const { data, error: insertError } = await db.from("schools").insert(row).select("id, slug, is_demo").single();
    if (insertError) throw new Error(`No se pudo insertar ${row.slug}: ${insertError.message}`);
    console.log(`  ✓ insertada: id ${data.id}, is_demo=${data.is_demo}`);
  }

  if (!confirm && pending > 0)
    console.log(`\n${pending} escuela(s) por insertar. Ejecuta con --confirm para insertarlas.`);
  if (pending === 0) console.log("\nNada que insertar.");
}

main().catch((error) => {
  console.error(`\nERROR: ${error instanceof Error ? error.message : "desconocido"}`);
  process.exitCode = 1;
});
