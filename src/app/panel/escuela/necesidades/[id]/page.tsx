import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { NeedProgressBars } from "@/components/needs/need-progress";
import { NeedStatusBadge } from "@/components/needs/need-status-badge";
import { NeedTimeline } from "@/components/needs/need-timeline";
import { requireActor } from "@/lib/auth/session";
import { getSchoolNeedHistory, getSchoolPanel } from "@/lib/data/panel";
import { formatQuantity } from "@/lib/domain/labels";
import { computeProgress } from "@/lib/domain/progress";
import { summarizeRegistry } from "@/lib/domain/timeline";

/** Historial de una necesidad de la escuela en sesión. Otra escuela o id inexistente → 404. */
export default async function SchoolNeedHistoryPage(props: PageProps<"/panel/escuela/necesidades/[id]">) {
  await requireActor(["school_rep"]);
  const { id } = await props.params;

  // getSchoolNeedHistory comprueba que la necesidad sea de actor.schoolId.
  const steps = await getSchoolNeedHistory(id);
  if (!steps) notFound();
  // Título y progreso: del panel de la propia escuela (sin cambiar B1).
  const need = (await getSchoolPanel())?.needs.find((n) => n.id === id);
  if (!need) notFound();

  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs items={[{ label: "Panel de la escuela", href: "/panel/escuela" }, { label: need.title }]} />
      <header className="flex flex-col gap-3">
        <div>
          <NeedStatusBadge status={need.status} />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{need.title}</h1>
        <p className="text-muted-foreground">Meta: {formatQuantity(need.goal_quantity, need.goal_unit)}</p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="historial" className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="historial" className="text-2xl font-semibold tracking-tight">
              Historial
            </h2>
            <p className="text-sm text-muted-foreground">
              Cada paso, en orden, con quién lo realizó y su número de registro en Hedera.
            </p>
          </div>
          <NeedTimeline steps={steps} />
        </section>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="progreso" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <h2 id="progreso" className="text-lg font-semibold">
              Progreso
            </h2>
            <NeedProgressBars
              progress={computeProgress(need.progress.goal, need.progress.committed, need.progress.confirmed)}
              unit={need.goal_unit}
            />
            <p className="text-xs text-muted-foreground">Solo lo confirmado por la escuela cuenta como recibido.</p>
          </section>
          <section aria-labelledby="registro" className="flex flex-col gap-2 rounded-xl bg-secondary/50 p-5 text-sm">
            <h2 id="registro" className="text-base font-semibold">
              Registro en Hedera
            </h2>
            <p className="text-muted-foreground">{summarizeRegistry(steps)}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
