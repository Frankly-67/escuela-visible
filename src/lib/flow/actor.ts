import "server-only";

import type { Actor } from "@/lib/domain/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

import { FlowError } from "./errors";

/**
 * Actor a partir de su perfil en la base de datos (rol y escuela salen de
 * `profiles`, nunca del cliente). Usado por scripts; la app obtendrá el id
 * de la sesión y luego llamará a esta misma función.
 */
export async function getActorById(profileId: string): Promise<Actor> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, role, school_id")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);
  if (!data) throw new FlowError("ACTOR_NOT_FOUND", "El usuario no tiene perfil.");
  return { id: data.id, role: data.role, schoolId: data.school_id };
}
