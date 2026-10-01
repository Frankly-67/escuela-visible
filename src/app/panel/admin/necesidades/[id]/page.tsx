import Link from "next/link";
import { notFound } from "next/navigation";

import { DemoBadge } from "@/components/common/demo-badge";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { NeedStatusBadge } from "@/components/needs/need-status-badge";
import { ReviewActions } from "@/components/panel/review-actions";
import { requireActor } from "@/lib/auth/session";
import { getAdminNeedReview } from "@/lib/data/panel";
import { CATEGORY_LABEL, formatDate, formatQuantity, NEED_KIND_LABEL, PRIORITY_LABEL } from "@/lib/domain/labels";

const PRIVACY_CHECKLIST = [
  "No incluye nombres de menores.",
  "No incluye datos individuales de estudiantes (las necesidades se expresan de forma agregada).",
  "No incluye direcciones particulares.",
  "No incluye datos médicos.",
];

/** Revisión administrativa de una necesidad: datos, checklist de privacidad y decisión (si está pendiente). */
export default async function AdminNeedReviewPage(props: PageProps<"/panel/admin/necesidades/[id]">) {
  await requireActor(["admin"]);
  const { id } = await props.params;
  const need = await getAdminNeedReview(id);
  if (!need) notFound();

  const details = [
    { label: "Tipo", value: NEED_KIND_LABEL[need.kind] },
    { label: "Categoría", value: CATEGORY_LABEL[need.category] },
    { label: "Prioridad", value: PRIORITY_LABEL[need.priority].replace("Prioridad ", "") },
    { label: "Meta", value: formatQuantity(need.goal_quantity, need.goal_unit) },
    { label: "Fecha del evento", value: need.event_date ? formatDate(`${need.event_date}T12:00:00-05:00`) : "—" },
    { label: "Registrada el", value: formatDate(need.created_at) },
    { label: "Validada el", value: need.validated_at ? formatDate(need.validated_at) : "—" },
    { label: "Completada el", value: need.completed_at ? formatDate(need.completed_at) : "—" },
    { label: "Última actualización", value: formatDate(need.updated_at) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs items={[{ label: "Panel de administración", href: "/panel/admin" }, { label: need.title }]} />

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <NeedStatusBadge status={need.status} />
          {need.school?.is_demo && <DemoBadge />}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{need.title}</h1>
        {need.school && (
          <p className="text-muted-foreground">
            <Link href={`/escuelas/${need.school.slug}`} className="font-medium text-foreground hover:underline">
              {need.school.name}
            </Link>{" "}
            · {need.school.vereda ? `${need.school.vereda}, ` : ""}
            {need.school.municipality}, {need.school.department}
          </p>
        )}
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="descripcion" className="flex flex-col gap-2">
            <h2 id="descripcion" className="text-lg font-semibold">
              Descripción
            </h2>
            <p className="max-w-3xl leading-relaxed">{need.description || "Sin descripción."}</p>
          </section>
          <dl className="grid gap-4 border-t pt-6 text-sm sm:grid-cols-2">
            {details.map((d) => (
              <div key={d.label} className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">{d.label}</dt>
                <dd className="font-medium">{d.value}</dd>
              </div>
            ))}
          </dl>
          <Link
            href={`/necesidades/${need.id}`}
            className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver la página de la necesidad y su historial
          </Link>
        </article>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="privacidad" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <h2 id="privacidad" className="text-lg font-semibold">
              Revisión de privacidad
            </h2>
            <p className="text-sm text-muted-foreground">Antes de validar, comprobar que la necesidad:</p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {PRIVACY_CHECKLIST.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <ReviewActions needId={need.id} status={need.status} />
        </aside>
      </div>
    </div>
  );
}
