import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DemoBadge } from "@/components/common/demo-badge";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { NeedProgressBars } from "@/components/needs/need-progress";
import { NeedStatusBadge } from "@/components/needs/need-status-badge";
import { getNeed } from "@/lib/data/public";
import { CATEGORY_LABEL, formatQuantity, NEED_KIND_LABEL, PRIORITY_LABEL } from "@/lib/domain/labels";

const dateFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "America/Bogota" });

export async function generateMetadata(props: PageProps<"/necesidades/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const result = await getNeed(id);
  return result
    ? { title: result.need.title, description: `${result.need.title} — ${result.school.name}.` }
    : { title: "Necesidad no encontrada" };
}

export default async function NeedPage(props: PageProps<"/necesidades/[id]">) {
  const { id } = await props.params;
  const result = await getNeed(id);
  if (!result) notFound();
  const { need, school } = result;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6">
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: school.name, href: `/escuelas/${school.slug}` },
          { label: need.title },
        ]}
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="flex flex-col gap-6">
          <header className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <NeedStatusBadge status={need.status} />
              {school.is_demo && <DemoBadge />}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{need.title}</h1>
            <p className="text-muted-foreground">
              <Link href={`/escuelas/${school.slug}`} className="font-medium text-foreground hover:underline">
                {school.name}
              </Link>{" "}
              · {school.municipality}, {school.department}
            </p>
          </header>

          {need.description && <p className="max-w-3xl text-lg leading-relaxed">{need.description}</p>}

          <dl className="grid gap-4 border-t pt-6 text-sm sm:grid-cols-2">
            <Detail label="Tipo" value={NEED_KIND_LABEL[need.kind]} />
            <Detail label="Categoría" value={CATEGORY_LABEL[need.category]} />
            <Detail label="Prioridad" value={PRIORITY_LABEL[need.priority].replace("Prioridad ", "")} />
            <Detail label="Meta" value={formatQuantity(need.goal_quantity, need.goal_unit)} />
            {need.event_date && <Detail label="Fecha" value={dateFormat.format(new Date(`${need.event_date}T12:00:00`))} />}
            <Detail label="Creada el" value={dateFormat.format(new Date(need.created_at))} />
          </dl>
        </article>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="progreso" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <h2 id="progreso" className="text-lg font-semibold">
              Progreso
            </h2>
            <NeedProgressBars progress={need.progress} unit={need.goal_unit} />
            <p className="text-xs text-muted-foreground">
              Solo lo confirmado por la escuela cuenta como recibido.
            </p>
          </section>

          <section aria-labelledby="registro" className="flex flex-col gap-2 rounded-xl bg-secondary/50 p-5 text-sm">
            <h2 id="registro" className="text-base font-semibold">
              Registro de la ayuda
            </h2>
            <p className="text-muted-foreground">
              Cada paso de esta necesidad queda en un historial. Las confirmaciones pueden registrarse en Hedera para
              permitir una verificación independiente del registro.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
