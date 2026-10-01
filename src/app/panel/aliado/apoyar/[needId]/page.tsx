import Link from "next/link";
import { notFound } from "next/navigation";

import { DemoBadge } from "@/components/common/demo-badge";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { NeedProgressBars } from "@/components/needs/need-progress";
import { CommitmentForm } from "@/components/panel/commitment-form";
import { requireActor } from "@/lib/auth/session";
import { getNeed } from "@/lib/data/public";
import { formatQuantity } from "@/lib/domain/labels";
import { availableQuantity } from "@/lib/domain/state-machine";

/**
 * Comprometerse con una necesidad (solo supporter). La necesidad se lee con la
 * lectura pública existente (RLS). El disponible mostrado es orientativo: el
 * servidor lo vuelve a calcular con bloqueo al registrar el compromiso.
 */
export default async function SupportNeedPage(props: PageProps<"/panel/aliado/apoyar/[needId]">) {
  await requireActor(["supporter"]);
  const { needId } = await props.params;
  const result = await getNeed(needId);
  if (!result) notFound();
  const { need, school } = result;

  const available = availableQuantity(need.goal_quantity, need.progress.committed);
  const open = need.status === "published" && available > 0;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <Breadcrumbs items={[{ label: "Panel del aliado", href: "/panel/aliado" }, { label: "Comprometer apoyo" }]} />

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{need.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <Link href={`/escuelas/${school.slug}`} className="font-medium text-foreground hover:underline">
            {school.name}
          </Link>
          {school.is_demo && <DemoBadge />}
          <span>
            · {school.municipality}, {school.department}
          </span>
        </p>
      </header>

      <section aria-labelledby="estado" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <h2 id="estado" className="sr-only">
          Estado de la necesidad
        </h2>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Meta</dt>
            <dd className="font-semibold">{formatQuantity(need.goal_quantity, need.goal_unit)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Comprometido</dt>
            <dd className="font-semibold">{formatQuantity(need.progress.committed, need.goal_unit)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Disponible</dt>
            <dd className="font-semibold">{formatQuantity(available, need.goal_unit)}</dd>
          </div>
        </dl>
        <NeedProgressBars progress={need.progress} unit={need.goal_unit} compact />
      </section>

      {open ? (
        <section aria-labelledby="compromiso" className="flex flex-col gap-4">
          <h2 id="compromiso" className="text-2xl font-semibold tracking-tight">
            Comprometer apoyo
          </h2>
          <div role="note" className="rounded-xl border border-accent bg-accent/40 p-4 text-sm text-accent-foreground">
            Comprometerte no es entregar. Después de entregar, repórtalo desde tu panel; la ayuda solo cuenta como recibida
            cuando la escuela confirma la recepción.
          </div>
          <CommitmentForm needId={need.id} unit={need.goal_unit} />
        </section>
      ) : (
        <p role="status" className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          {need.status === "published"
            ? "Esta necesidad ya tiene compromisos por el total de su meta."
            : "Esta necesidad no está abierta a compromisos."}
        </p>
      )}
    </div>
  );
}
