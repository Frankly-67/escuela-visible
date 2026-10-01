import Link from "next/link";

import { formatEventDate, PostKindBadge } from "@/components/board/post-card";
import { DemoBadge } from "@/components/common/demo-badge";
import { ConfirmReceiptButton } from "@/components/panel/confirm-receipt-button";
import { PanelNeedCard } from "@/components/panel/panel-need-card";
import { SummaryCards } from "@/components/panel/summary-cards";
import { requireActor } from "@/lib/auth/session";
import { getSchoolPosts } from "@/lib/data/board";
import { getSchoolPanel } from "@/lib/data/panel";
import { BOARD_STATUS_LABEL } from "@/lib/domain/board";
import { formatDate, formatQuantity } from "@/lib/domain/labels";

// Las Server Actions de esta página (confirmReceiptAction) publican en Hedera (publishEvent): envío + receipt
// (≈3–7 s observado) y hasta 5 consultas al Mirror Node (1,5 s + timeout de 8 s cada una).
// Observado de punta a punta: 1–18 s; peor caso teórico ≈ 50 s. Ver docs/DEPLOY.md.
export const maxDuration = 60;

export default async function SchoolPanelPage() {
  await requireActor(["school_rep"]);
  // La escuela sale de la sesión (actor.schoolId) dentro de getSchoolPanel(); nunca de la URL.
  const [panel, posts] = await Promise.all([getSchoolPanel(), getSchoolPosts()]);

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
            Solo lo confirmado por la escuela cuenta como recibido. Confirma únicamente lo que la escuela ya recibió.
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
                <div className="mt-2">
                  <ConfirmReceiptButton commitmentId={d.commitmentId} quantityText={formatQuantity(d.quantity, d.goalUnit)} />
                </div>
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

      <section aria-labelledby="tablon" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="tablon" className="text-2xl font-semibold tracking-tight">
            Publicaciones en el tablón
          </h2>
          <p className="text-sm text-muted-foreground">
            Escuela Visible revisa cada publicación antes de mostrarla. Después de enviarla no se puede editar.
          </p>
          {posts.available && (
            <Link
              href="/panel/escuela/publicaciones/nueva"
              className="mt-2 self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              Nueva publicación
            </Link>
          )}
        </div>
        {!posts.available ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">El tablón aún no está disponible.</p>
        ) : posts.posts.length === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            La escuela todavía no tiene publicaciones.
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {posts.posts.map((post) => (
              <li key={post.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <PostKindBadge kind={post.kind} />
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{BOARD_STATUS_LABEL[post.status]}</span>
                </div>
                <p className="font-semibold">{post.title}</p>
                {post.eventDate && <p className="text-xs text-muted-foreground">Fecha: {formatEventDate(post.eventDate)}</p>}
                <p className="text-xs text-muted-foreground">Enviada el {formatDate(post.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
