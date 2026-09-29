import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { getSupabaseSecretKey } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Cliente con la secret key: SALTA RLS.
 * Usar solo en Server Actions / Route Handlers / scripts, después de validar
 * el rol del usuario y la transición de estado en el servidor.
 */
export function createAdminClient() {
  return createClient<Database>(publicEnv.supabaseUrl, getSupabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
