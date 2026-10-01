import Link from "next/link";

import { DemoBadge } from "@/components/common/demo-badge";
import type { PublicPostDTO } from "@/lib/data/board";
import { BOARD_KIND_LABEL, type BoardPostKind } from "@/lib/domain/board";
import { formatDate } from "@/lib/domain/labels";

/** "15 de octubre de 2026" a partir de una fecha sin hora (sin desfase de zona horaria). */
export const formatEventDate = (date: string) => formatDate(`${date}T12:00:00-05:00`);

export function PostKindBadge({ kind }: { kind: BoardPostKind }) {
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
      {BOARD_KIND_LABEL[kind]}
    </span>
  );
}

/**
 * Publicación del tablón (solo lectura). Texto plano, sin imágenes ni
 * contactos. Muestra la escuela (con DEMO si es ficticia) salvo en la página
 * de la propia escuela.
 */
export function PostCard({ post, showSchool = true }: { post: PublicPostDTO; showSchool?: boolean }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <PostKindBadge kind={post.kind} />
        {post.eventDate && <span className="text-xs font-medium">Fecha: {formatEventDate(post.eventDate)}</span>}
      </div>
      <h3 className="text-xl leading-snug font-semibold">{post.title}</h3>
      {post.body && <p className="text-sm whitespace-pre-line text-muted-foreground">{post.body}</p>}
      <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        {showSchool && post.school && (
          <span className="flex flex-wrap items-center gap-2">
            <Link
              href={`/escuelas/${post.school.slug}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {post.school.name}
            </Link>
            <span>
              {post.school.municipality}, {post.school.department}
            </span>
            {post.school.isDemo && <DemoBadge />}
          </span>
        )}
        {post.publishedAt && <span>Publicada el {formatDate(post.publishedAt)}</span>}
      </footer>
    </article>
  );
}

/** Aviso cuando el tablón aún no está disponible en este entorno (migración pendiente). */
export function BoardUnavailable() {
  return (
    <p role="status" className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
      El tablón aún no está disponible.
    </p>
  );
}
