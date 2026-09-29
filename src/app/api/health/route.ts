import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Estado básico de la app y de la conexión con Supabase. No expone secretos. */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, supabase: "not_configured" });
  }

  const supabase = await createClient();
  // GET (no `head: true`): una petición HEAD no reporta error si la tabla no existe.
  const { count, error } = await supabase
    .from("schools")
    .select("id", { count: "exact" })
    .limit(1);

  if (error) {
    return NextResponse.json({ ok: false, supabase: "error", error: error.message }, { status: 503 });
  }

  return NextResponse.json({ ok: true, supabase: "ok", schools: count });
}
