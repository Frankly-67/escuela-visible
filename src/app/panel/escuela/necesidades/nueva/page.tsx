import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { NeedForm } from "@/components/panel/need-form";
import { requireActor } from "@/lib/auth/session";

// Las Server Actions de esta página (createNeedAction) publican en Hedera (publishEvent): envío + receipt
// (≈3–7 s observado) y hasta 5 consultas al Mirror Node (1,5 s + timeout de 8 s cada una).
// Observado de punta a punta: 1–18 s; peor caso teórico ≈ 50 s. Ver docs/DEPLOY.md.
export const maxDuration = 60;

/** Registrar una necesidad para la escuela en sesión (la escuela no se elige: sale de la sesión). */
export default async function NewNeedPage() {
  const actor = await requireActor(["school_rep"]);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <Breadcrumbs items={[{ label: "Panel de la escuela", href: "/panel/escuela" }, { label: "Registrar necesidad" }]} />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Registrar necesidad</h1>
        <p className="text-muted-foreground">
          La necesidad quedará pendiente de validación. Escuela Visible la revisará antes de hacerla pública.
        </p>
      </header>
      {actor.schoolId ? (
        <NeedForm />
      ) : (
        <p role="alert" className="rounded-xl border border-dashed p-5 text-muted-foreground">
          Esta cuenta no tiene una escuela asociada.
        </p>
      )}
    </div>
  );
}
