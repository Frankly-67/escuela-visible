import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DemoBadge } from "@/components/common/demo-badge";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { NeedCard } from "@/components/needs/need-card";
import { getSchoolBySlug, listNeedsBySchool } from "@/lib/data/public";

export async function generateMetadata(props: PageProps<"/escuelas/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const school = await getSchoolBySlug(slug);
  return school
    ? { title: school.name, description: `${school.name} — ${school.municipality}, ${school.department}.` }
    : { title: "Escuela no encontrada" };
}

export default async function SchoolPage(props: PageProps<"/escuelas/[slug]">) {
  const { slug } = await props.params;
  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const needs = await listNeedsBySchool(school.id);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Escuelas", href: "/#escuelas" }, { label: school.name }]} />

      <header className="flex flex-col gap-4 border-b pb-8">
        <div className="flex flex-wrap items-center gap-3">{school.is_demo && <DemoBadge />}</div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{school.name}</h1>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Municipio</dt>
            <dd className="font-medium">
              {school.municipality}, {school.department}
            </dd>
          </div>
          {school.vereda && (
            <div>
              <dt className="text-muted-foreground">Vereda</dt>
              <dd className="font-medium">{school.vereda}</dd>
            </div>
          )}
        </dl>
        {school.description && <p className="max-w-3xl text-muted-foreground">{school.description}</p>}
        <p className="text-xs text-muted-foreground">Ubicación aproximada.</p>
      </header>

      <section aria-labelledby="necesidades" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id="necesidades" className="text-2xl font-semibold tracking-tight">
            Necesidades
          </h2>
          <p className="text-sm text-muted-foreground">
            Las necesidades se muestran públicamente después de que la plataforma las valida.
          </p>
        </div>

        {needs.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {needs.map((need) => (
              <NeedCard key={need.id} need={need} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            Esta escuela aún no tiene necesidades publicadas.
          </p>
        )}
      </section>
    </div>
  );
}
