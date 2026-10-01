import type { Metadata } from "next";
import Link from "next/link";

import { BoardUnavailable, PostCard } from "@/components/board/post-card";
import { listPublishedPosts } from "@/lib/data/board";
import { BOARD_KIND_LABEL, BOARD_POST_KINDS, parseBoardKindFilter } from "@/lib/domain/board";

export const metadata: Metadata = {
  title: "Tablón",
  description: "Bazares, sancochos, actividades y proyectos de las escuelas rurales, revisados por Escuela Visible.",
};

const chip =
  "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/50 aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground";

export default async function BoardPage(props: PageProps<"/tablon">) {
  // `tipo` es solo un filtro de presentación; se valida contra el enum antes de consultar.
  const { tipo } = await props.searchParams;
  const filter = parseBoardKindFilter(tipo);
  const result = filter.ok ? await listPublishedPosts(filter.kind) : null;
  const active = filter.ok ? filter.kind : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Tablón</h1>
        <p className="text-lg text-muted-foreground">
          Bazares, sancochos, actividades y proyectos de las escuelas. Cada publicación la envía la escuela y Escuela
          Visible la revisa antes de mostrarla.
        </p>
        <p className="text-sm text-muted-foreground">
          Las publicaciones del tablón no forman parte del registro en Hedera.
        </p>
      </header>

      <nav aria-label="Filtrar por tipo">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link href="/tablon" aria-current={filter.ok && active === null ? "page" : undefined} className={chip}>
              Todas
            </Link>
          </li>
          {BOARD_POST_KINDS.map((kind) => (
            <li key={kind}>
              <Link href={`/tablon?tipo=${kind}`} aria-current={active === kind ? "page" : undefined} className={chip}>
                {BOARD_KIND_LABEL[kind]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="publicaciones" className="flex flex-col gap-4">
        <h2 id="publicaciones" className="sr-only">
          {active ? `Publicaciones: ${BOARD_KIND_LABEL[active]}` : "Publicaciones"}
        </h2>
        {!filter.ok ? (
          <div role="alert" className="flex flex-col gap-2 rounded-xl border border-dashed p-5 text-sm">
            <p>El filtro de tipo no es válido.</p>
            <Link href="/tablon" className="self-start font-medium text-primary underline-offset-4 hover:underline">
              Ver todas
            </Link>
          </div>
        ) : !result?.available ? (
          <BoardUnavailable />
        ) : result.posts.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {active ? "No hay publicaciones de este tipo." : "Todavía no hay publicaciones en el tablón."}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {result.posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
