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
  const { count, error } = await supabase
    .from("schools")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ ok: false, supabase: "error", error: error.message }, { status: 503 });
  }

  return NextResponse.json({ ok: true, supabase: "ok", schools: count });
}
