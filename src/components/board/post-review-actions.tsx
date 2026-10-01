"use client";

import { useActionState, useState } from "react";

import { publishPostAction, rejectPostAction } from "@/app/panel/admin/actions";
import { Button } from "@/components/ui/button";
import { BOARD_IDLE, type BoardActionState } from "@/lib/actions/board-result";

type Decision = "publish" | "reject";

const CONFIRM: Record<Decision, { question: string; submit: string }> = {
  publish: {
    question:
      "¿Confirmas que revisaste la publicación y que no incluye nombres de estudiantes, teléfonos, correos ni direcciones? Será pública en el tablón.",
    submit: "Sí, aprobar y publicar",
  },
  reject: {
    question: "¿Confirmas que esta publicación no se aprueba? No se mostrará en el tablón.",
    submit: "Sí, no aprobar",
  },
};

/**
 * Revisión de una publicación pendiente. Cada decisión pide confirmación; el
 * servidor vuelve a comprobar rol, estado y transición (los botones no son
 * la seguridad). Sin eventos ni publicación en Hedera.
 */
export function PostReviewActions({ postId, title }: { postId: string; title: string }) {
  const [publishState, publishAction, publishing] = useActionState<BoardActionState, FormData>(publishPostAction, BOARD_IDLE);
  const [rejectState, rejectAction, rejecting] = useActionState<BoardActionState, FormData>(rejectPostAction, BOARD_IDLE);
  const [confirming, setConfirming] = useState<Decision | null>(null);

  const done = [publishState, rejectState].find((s) => s.status === "success");
  if (done && done.status === "success") {
    return (
      <p role="status" className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 text-sm font-semibold">
        {done.message}
      </p>
    );
  }

  const pending = publishing || rejecting;
  const error = [publishState, rejectState].find((s) => s.status === "error");

  return (
    <div className="flex flex-col gap-3">
      {confirming === null ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => setConfirming("publish")} aria-label={`Aprobar: ${title}`}>
            Aprobar y publicar
          </Button>
          <Button type="button" variant="outline" onClick={() => setConfirming("reject")} aria-label={`No aprobar: ${title}`}>
            No aprobar
          </Button>
        </div>
      ) : (
        <form action={confirming === "publish" ? publishAction : rejectAction} className="flex flex-col gap-3">
          <input type="hidden" name="postId" value={postId} />
          <p className="text-sm">{CONFIRM[confirming].question}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              variant={confirming === "reject" ? "destructive" : "default"}
              disabled={pending}
              aria-disabled={pending}
            >
              {CONFIRM[confirming].submit}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
              Cancelar
            </Button>
          </div>
          {pending && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Guardando…
            </p>
          )}
        </form>
      )}
      {error && error.status === "error" && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      )}
    </div>
  );
}
