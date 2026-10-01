import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PostCard } from "@/components/board/post-card";
import { DocumentedCaseHero, DocumentedCaseSections } from "@/components/cases/documented-case";
import { DemoBadge } from "@/components/common/demo-badge";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { NeedCard } from "@/components/needs/need-card";
import { getDocumentedCase, type DocumentedCase } from "@/content/documented-cases";
import { listSchoolPublishedPosts } from "@/lib/data/board";
import { getSchoolBySlug, listNeedsBySchool, type PublicNeed, type PublicSchool } from "@/lib/data/public";

/**
 * Escuela de la base de datos y, si existe, su caso real documentado (contenido estático).
 * - El caso se muestra aunque la escuela aún no esté en la base de datos.
 * - Nunca se muestra un caso real sobre una escuela marcada DEMO.
 */
async function loadSchool(
  slug: string,
): Promise<{ school: PublicSchool | null; documentedCase: DocumentedCase | null }> {
  const school = await getSchoolBySlug(slug);
  const documentedCase = school?.is_demo ? null : getDocumentedCase(slug);
  return { school, documentedCase };
}

export async function generateMetadata(props: PageProps<"/escuelas/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const { school, documentedCase } = await loadSchool(slug);
  const profile = school ?? documentedCase?.school;
  if (!profile) return { title: "Escuela no encontrada" };
  const summary = documentedCase ? ` Caso real documentado: ${documentedCase.summary}` : "";
  return {
    title: profile.name,
    description: `${profile.name} — ${profile.municipality}, ${profile.department}.${summary}`,
  };
}

export default async function SchoolPage(props: PageProps<"/escuelas/[slug]">) {
  const { slug } = await props.params;
  const { school, documentedCase } = await loadSchool(slug);
  if (documentedCase) return <DocumentedCasePage documentedCase={documentedCase} school={school} />;
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

      <NeedsSection needs={needs} />
      <SchoolPostsSection schoolId={school.id} />
    </div>
  );
}

async function DocumentedCasePage({
  documentedCase,
  school,
}: {
  documentedCase: DocumentedCase;
  school: PublicSchool | null;
}) {
  // Solo si la escuela ya está en la base de datos y tiene necesidades publicadas en la plataforma.
  const needs = school ? await listNeedsBySchool(school.id) : [];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-10 sm:px-6">
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: "Escuelas", href: "/#escuelas" },
          { label: documentedCase.school.name },
        ]}
      />
      <DocumentedCaseHero documentedCase={documentedCase} />
      <DocumentedCaseSections documentedCase={documentedCase} />
      {needs.length > 0 && <NeedsSection needs={needs} />}
      {school && <SchoolPostsSection schoolId={school.id} />}
    </div>
  );
}

function NeedsSection({ needs }: { needs: PublicNeed[] }) {
  return (
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
  );
}

/** Publicaciones aprobadas de la escuela en el tablón. Solo si tiene alguna. */
async function SchoolPostsSection({ schoolId }: { schoolId: string }) {
  const result = await listSchoolPublishedPosts(schoolId);
  if (!result.available || result.posts.length === 0) return null;
  return (
    <section aria-labelledby="publicaciones" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="publicaciones" className="text-2xl font-semibold tracking-tight">
          Publicaciones
        </h2>
        <p className="text-sm text-muted-foreground">
          Publicaciones de la escuela en el{" "}
          <Link href="/tablon" className="font-medium text-primary underline-offset-4 hover:underline">
            tablón
          </Link>
          , revisadas por Escuela Visible.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {result.posts.map((post) => (
          <PostCard key={post.id} post={post} showSchool={false} />
        ))}
      </div>
    </section>
  );
}
