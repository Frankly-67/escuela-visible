import Link from "next/link";

import { DemoBadge } from "@/components/common/demo-badge";
import { requireActor } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function SchoolPanelPage() {
  const actor = await requireActor(["school_rep"]);

  // La escuela sale del perfil (sesión), nunca del navegador. Lectura pública bajo RLS.
  const supabase = await createClient();
  const { data: school } = actor.schoolId
    ? await supabase.from("schools").select("name, slug, municipality, department, is_demo").eq("id", actor.schoolId).maybeSingle()
    : { data: null };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Panel de la escuela</h1>
      {school ? (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Escuela asociada</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/escuelas/${school.slug}`} className="text-lg font-semibold hover:underline">
              {school.name}
            </Link>
            {school.is_demo && <DemoBadge />}
          </div>
          <p className="text-sm text-muted-foreground">
            {school.municipality}, {school.department}
          </p>
        </div>
      ) : (
        <p role="alert" className="rounded-xl border border-dashed p-5 text-muted-foreground">
          Esta cuenta no tiene una escuela asociada.
        </p>
      )}
      <p className="max-w-2xl text-muted-foreground">
        El panel está preparado. Aquí podrás crear necesidades, seguir su validación y confirmar las entregas que reciba la
        escuela; esas acciones se habilitarán en las siguientes fases.
      </p>
    </section>
  );
}
