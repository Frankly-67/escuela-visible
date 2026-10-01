import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { Actor, UserRole } from "@/lib/domain/permissions";
import { isSupabaseConfigured } from "@/lib/env";
// Única importación de flow/: lectura del perfil (rol y escuela) con la capa
// server-side existente. Ninguna función de negocio.
import { getActorById } from "@/lib/flow/actor";
import { createClient } from "@/lib/supabase/server";

/**
 * Capa de sesión (DAL). El Actor SIEMPRE sale de la sesión de Supabase
 * (JWT validado con getClaims) y de `profiles`; nunca de datos del navegador.
 */

/** Panel de cada rol. */
export const PANEL_PATH: Record<UserRole, string> = {
  school_rep: "/panel/escuela",
  supporter: "/panel/aliado",
  admin: "/panel/admin",
};

/** Actor de la sesión actual, o null si no hay sesión válida. Una consulta por petición. */
export const getSessionActor = cache(async (): Promise<Actor | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return null;

  try {
    return await getActorById(userId);
  } catch (e) {
    // Usuario autenticado sin perfil: se trata como sin sesión.
    if ((e as { code?: string })?.code === "ACTOR_NOT_FOUND") return null;
    throw e;
  }
});

/**
 * Exige sesión (y, si se indica, uno de los roles). Sin sesión → /ingresar.
 * Con otro rol → su propio panel. Llamar en cada página protegida: los
 * layouts no se vuelven a ejecutar al navegar entre páginas hermanas.
 */
export async function requireActor(roles?: readonly UserRole[]): Promise<Actor> {
  const actor = await getSessionActor();
  if (!actor) redirect("/ingresar");
  if (roles && !roles.includes(actor.role)) redirect(PANEL_PATH[actor.role]);
  return actor;
}
