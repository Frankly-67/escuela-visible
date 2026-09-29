/**
 * Verifica las variables de entorno SIN imprimir valores.
 * Uso: npm run env:check
 */
import "./lib/load-env";

import { isSupabaseConfigured } from "@/lib/env";
import { checkServerEnv } from "@/lib/env.server";

const results = {
  "supabase (público)": {
    ok: isSupabaseConfigured(),
    issues: isSupabaseConfigured()
      ? []
      : ["NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  },
  ...checkServerEnv(),
};

for (const [group, { ok, issues }] of Object.entries(results)) {
  console.log(`${ok ? "✓" : "✗"} ${group}`);
  for (const issue of issues) console.log(`    - ${issue}`);
}

// No falla el proceso: en esta fase Hedera y DEMO pueden estar pendientes.
