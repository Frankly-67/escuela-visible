import { formatEventDate, PostKindBadge } from "@/components/board/post-card";
import { PostReviewActions } from "@/components/board/post-review-actions";
import { DemoBadge } from "@/components/common/demo-badge";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { requireActor } from "@/lib/auth/session";
import { getPendingPosts } from "@/lib/data/board";
import { formatDate } from "@/lib/domain/labels";

/**
 * Revisión de publicaciones del tablón. Muestra el texto completo de cada
 * publicación pendiente para revisar su privacidad antes de aprobarla.
 */
export default async function AdminPostsPage() {
  await requireActor(["admin"]);
  const result = await getPendingPosts();

  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs items={[{ label: "Panel de administración", href: "/panel/admin" }, { label: "Publicaciones por revisar" }]} />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Publicaciones por revisar</h1>
        <p className="max-w-2xl text-muted-foreground">
          Una publicación solo es pública después de aprobarla. Revisa que no incluya nombres de estudiantes, teléfonos,
          correos ni direcciones. Las publicaciones no se registran en Hedera.
        </p>
      </header>

      {!result.available ? (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">El tablón aún no está disponible.</p>
      ) : result.posts.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          No hay publicaciones pendientes de revisión.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {result.posts.map((post) => (
            <li key={post.id} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <PostKindBadge kind={post.kind} />
                {post.eventDate && <span className="text-xs font-medium">Fecha: {formatEventDate(post.eventDate)}</span>}
              </div>
              <h2 className="text-xl leading-snug font-semibold">{post.title}</h2>
              {post.body ? (
                <p className="text-sm whitespace-pre-line">{post.body}</p>
              ) : (
                <p className="text-sm text-muted-foreground">(Sin texto)</p>
              )}
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {post.school && (
                  <>
                    <span className="font-medium text-foreground">{post.school.name}</span>
                    {post.school.isDemo && <DemoBadge />}
                  </>
                )}
                <span>Enviada el {formatDate(post.createdAt)}</span>
              </p>
              <PostReviewActions postId={post.id} title={post.title} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
