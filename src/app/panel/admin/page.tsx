import Link from "next/link";

import { DemoBadge } from "@/components/common/demo-badge";
import { PanelNeedCard } from "@/components/panel/panel-need-card";
import { SummaryCards } from "@/components/panel/summary-cards";
import { requireActor } from "@/lib/auth/session";
import { getPendingPosts } from "@/lib/data/board";
import { getAdminNeeds, getAdminOverview } from "@/lib/data/panel";
import { EVENT_LABEL, formatDateTime } from "@/lib/domain/labels";
import { NEED_STATUSES } from "@/lib/domain/panel";

const STATUS_SUMMARY_LABEL: Record<(typeof NEED_STATUSES)[number], string> = {
  pending_validation: "Pendientes de validación",
  published: "Abiertas a apoyos",
  completed: "Completadas",
  cancelled: "No aprobadas",
};

export default async function AdminPanelPage(props: PageProps<"/panel/admin">) {
  await requireActor(["admin"]);
  // `estado` es solo un filtro de presentación; getAdminNeeds lo valida contra el enum.
  const { estado } = await props.searchParams;
  const [overview, result, pendingPosts] = await Promise.all([getAdminOverview(), getAdminNeeds(estado), getPendingPosts()]);
  const filter = result.ok ? result.filter : null;
  const total = Object.values(overview.counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Panel de administración</h1>
        <p className="max-w-2xl text-muted-foreground">
          Necesidades por estado, publicación de registros y actividad reciente. Para validar o no aprobar una necesidad
          pendiente, entra en «Revisar».
        </p>
      </header>

      <section aria-labelledby="estados" className="flex flex-col gap-3">
        <h2 id="estados" className="text-lg font-semibold">
          Necesidades por estado
        </h2>
        <SummaryCards
          label="Filtrar necesidades por estado"
          items={[
            { label: "Todas", value: total, href: "/panel/admin", active: result.ok && filter === null },
            ...NEED_STATUSES.map((s) => ({
              label: STATUS_SUMMARY_LABEL[s],
              value: overview.counts[s],
              href: `/panel/admin?estado=${s}`,
              active: filter === s,
            })),
          ]}
        />
      </section>

      <section aria-labelledby="tablon" className="flex flex-col gap-3">
        <h2 id="tablon" className="text-lg font-semibold">
          Tablón
        </h2>
        {pendingPosts.available ? (
          <SummaryCards
            label="Publicaciones del tablón"
            items={[
              {
                label: "Publicaciones por revisar",
                value: pendingPosts.posts.length,
                hint: "Revisar y aprobar",
                href: "/panel/admin/publicaciones",
              },
            ]}
          />
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">El tablón aún no está disponible.</p>
        )}
      </section>

      <section aria-labelledby="publicacion" className="flex flex-col gap-3">
        <h2 id="publicacion" className="text-lg font-semibold">
          Publicación en Hedera
        </h2>
        <SummaryCards
          label="Registros por estado de publicación"
          items={[
            { label: "Publicados", value: overview.publication.submitted },
            { label: "Pendientes", value: overview.publication.pending },
            { label: "Fallidos", value: overview.publication.failed },
          ]}
        />
        {overview.publication.failed > 0 && (
          <p role="alert" className="rounded-xl border border-dashed p-4 text-sm">
            Hay registros con publicación fallida.
          </p>
        )}
      </section>

      <section aria-labelledby="necesidades" className="flex flex-col gap-4">
        <h2 id="necesidades" className="text-2xl font-semibold tracking-tight">
          {!result.ok ? "Necesidades" : filter ? `Necesidades: ${STATUS_SUMMARY_LABEL[filter].toLowerCase()}` : "Todas las necesidades"}
        </h2>
        {!result.ok ? (
          <div role="alert" className="flex flex-col gap-2 rounded-xl border border-dashed p-5 text-sm">
            <p>El filtro de estado no es válido.</p>
            <Link href="/panel/admin" className="self-start font-medium text-primary underline-offset-4 hover:underline">
              Ver todas
            </Link>
          </div>
        ) : result.needs.length === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            No hay necesidades en este estado.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {result.needs.map((need) => (
              <PanelNeedCard
                key={need.id}
                need={need}
                school={need.school}
                action={{ href: `/panel/admin/necesidades/${need.id}`, label: "Revisar" }}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="actividad" className="flex flex-col gap-4">
        <h2 id="actividad" className="text-2xl font-semibold tracking-tight">
          Actividad reciente
        </h2>
        {overview.recentActivity.length === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            Todavía no hay actividad registrada.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {overview.recentActivity.map((a) => (
              <li key={a.eventId} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-medium">{EVENT_LABEL[a.type]}</p>
                  <p className="text-sm text-muted-foreground">
                    {a.needTitle} · {a.school.name} {a.school.isDemo && <DemoBadge className="ml-1 align-middle" />}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(a.recordedAt)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    {a.published ? "Publicado en Hedera" : "Pendiente de publicación"}
                  </span>
                  <Link
                    href={`/verify/${a.eventId}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    aria-label={`Ver verificación: ${EVENT_LABEL[a.type]}`}
                  >
                    Ver verificación
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
