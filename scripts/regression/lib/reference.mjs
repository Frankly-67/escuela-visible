/**
 * Valores de referencia para los escaneos de privacidad, leídos en tiempo de
 * ejecución (SOLO LECTURA, con la secret key): ids de perfiles (personas) y de
 * escuelas. Nunca se guardan en el repositorio ni se imprimen.
 */
import { createClient } from "@supabase/supabase-js";

import { loadEnv } from "./env.mjs";

export async function loadReference() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY para leer la referencia de privacidad.");
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [profiles, schools] = await Promise.all([db.from("profiles").select("id"), db.from("schools").select("id, slug")]);
  if (profiles.error || schools.error) throw new Error("No se pudo leer la referencia (perfiles/escuelas).");
  return {
    personIds: profiles.data.map((p) => p.id),
    schoolIds: schools.data.map((s) => s.id),
    miradorSchoolId: schools.data.find((s) => s.slug === "escuela-demo-el-mirador")?.id ?? "",
  };
}
