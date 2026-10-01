import { PostForm } from "@/components/board/post-form";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { requireActor } from "@/lib/auth/session";

/** Enviar una publicación al tablón para la escuela en sesión (la escuela no se elige: sale de la sesión). */
export default async function NewPostPage() {
  const actor = await requireActor(["school_rep"]);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <Breadcrumbs items={[{ label: "Panel de la escuela", href: "/panel/escuela" }, { label: "Nueva publicación" }]} />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Nueva publicación en el tablón</h1>
        <p className="text-muted-foreground">
          La publicación quedará pendiente de revisión. Escuela Visible la revisará antes de mostrarla en el tablón.
        </p>
      </header>
      {actor.schoolId ? (
        <PostForm />
      ) : (
        <p role="alert" className="rounded-xl border border-dashed p-5 text-muted-foreground">
          Esta cuenta no tiene una escuela asociada.
        </p>
      )}
    </div>
  );
}
