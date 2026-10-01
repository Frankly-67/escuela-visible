import Link from "next/link";

import { DemoBadge } from "@/components/common/demo-badge";
import { PanelNeedCard } from "@/components/panel/panel-need-card";
import { SummaryCards } from "@/components/panel/summary-cards";
import { requireActor } from "@/lib/auth/session";
import { getSchoolPanel } from "@/lib/data/panel";
import { formatDate, formatQuantity } from "@/lib/domain/labels";

export default async function SchoolPanelPage() {
  await requireActor(["school_rep"]);
  // La escuela sale de la sesión (actor.schoolId) dentro de getSchoolPanel(); nunca de la URL.
  const panel = await getSchoolPanel();

  if (!panel) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Panel de la escuela</h1>
        <p role="alert" className="rounded-xl border border-dashed p-5 text-muted-foreground">
          Esta cuenta no tiene una escuela asociada.
        </p>
      </section>
    );
  }

  const { school, counts, needs, pendingDeliveries } = panel;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Panel de la escuela</h1>
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold">{school.name}</p>
            {school.is_demo && <DemoBadge />}
          </div>
          <p className="text-sm text-muted-foreground">
            {school.vereda ? `${school.vereda} · ` : ""}
            {school.municipality}, {school.department}
          </p>
          <Link
            href={`/escuelas/${school.slug}`}
            className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver la página pública de la escuela
          </Link>
        </div>
      </header>

      <SummaryCards
        label="Resumen de necesidades y entregas"
        items={[
          { label: "Pendientes de validación", value: counts.pending_validation },
          { label: "Abiertas a apoyos", value: counts.published },
          { label: "Completadas", value: counts.completed },
          { label: "No aprobadas", value: counts.cancelled },
          { label: "Entregas por confirmar", value: pendingDeliveries.length },
        ]}
      />

      <section aria-labelledby="entregas" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="entregas" className="text-2xl font-semibold tracking-tight">
            Entregas reportadas por confirmar
          </h2>
          <p className="text-sm text-muted-foreground">
            Solo lo confirmado por la escuela cuenta como recibido. La confirmación se habilitará en una fase posterior.
          </p>
        </div>
        {pendingDeliveries.length === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            No hay entregas pendientes de confirmar.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pendingDeliveries.map((d) => (
              <li key={d.commitmentId} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
                <p className="font-semibold">{d.needTitle}</p>
                <p className="text-sm">
                  {d.text}: <span className="font-medium">{formatQuantity(d.quantity, d.goalUnit)}</span>
                </p>
                {d.deliveryReportedAt && (
                  <p className="text-xs text-muted-foreground">Reportada el {formatDate(d.deliveryReportedAt)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="necesidades" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="necesidades" className="text-2xl font-semibold tracking-tight">
            Necesidades de la escuela
          </h2>
          <p className="text-sm text-muted-foreground">Incluye las pendientes de validación y las no aprobadas.</p>
          <Link
            href="/panel/escuela/necesidades/nueva"
            className="mt-2 self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Registrar necesidad
          </Link>
        </div>
        {needs.length === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            La escuela todavía no tiene necesidades registradas.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {needs.map((need) => (
              <PanelNeedCard
                key={need.id}
                need={need}
                progress={need.progress}
                action={{ href: `/panel/escuela/necesidades/${need.id}`, label: "Ver historial" }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
