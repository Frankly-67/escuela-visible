"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { rejectNeedAction, validateNeedAction } from "@/app/panel/admin/actions";
import { Button } from "@/components/ui/button";
import { IDLE, type NeedActionState } from "@/lib/actions/flow-result";
import type { Enums } from "@/types/database";

type Decision = "validate" | "reject";

const CONFIRM: Record<Decision, { question: string; submit: string; pending: string }> = {
  validate: {
    question: "¿Confirmas que revisaste la privacidad y que la necesidad puede publicarse?",
    submit: "Sí, validar y publicar",
    pending: "Validando y publicando el registro en Hedera…",
  },
  reject: {
    question: "¿Confirmas que esta necesidad no se aprueba? Dejará de estar pendiente y no se publicará.",
    submit: "Sí, no aprobar",
    pending: "Guardando…",
  },
};

/**
 * Acciones de revisión del admin. Solo muestra botones si la necesidad está
 * pendiente de validación; cada decisión pide confirmación. El servidor vuelve
 * a comprobar rol, estado y transición (los botones no son la seguridad).
 */
export function ReviewActions({ needId, status }: { needId: string; status: Enums<"need_status"> }) {
  const [validateState, validateAction, validating] = useActionState<NeedActionState, FormData>(validateNeedAction, IDLE);
  const [rejectState, rejectAction, rejecting] = useActionState<NeedActionState, FormData>(rejectNeedAction, IDLE);
  const [confirming, setConfirming] = useState<Decision | null>(null);

  const done = [validateState, rejectState].find((s) => s.status === "success");
  if (done && done.status === "success") {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-5 text-sm">
        <p className="font-semibold">{done.message}</p>
        {done.eventId && (
          <Link href={`/verify/${done.eventId}`} className="font-medium text-primary underline-offset-4 hover:underline">
            Ver verificación del registro
          </Link>
        )}
        <Link href="/panel/admin" className="font-medium text-primary underline-offset-4 hover:underline">
          Volver al panel
        </Link>
      </div>
    );
  }

  if (status !== "pending_validation") {
    return (
      <p className="rounded-xl bg-secondary/50 p-5 text-sm text-muted-foreground">
        Esta necesidad ya fue revisada. Solo las necesidades pendientes de validación se pueden validar o no aprobar.
      </p>
    );
  }

  const pending = validating || rejecting;
  const error = [validateState, rejectState].find((s) => s.status === "error");

  return (
    <section aria-labelledby="decision" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <h2 id="decision" className="text-lg font-semibold">
        Decisión
      </h2>
      {confirming === null ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" size="lg" onClick={() => setConfirming("validate")}>
            Validar y publicar
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={() => setConfirming("reject")}>
            No aprobar
          </Button>
        </div>
      ) : (
        <form action={confirming === "validate" ? validateAction : rejectAction} className="flex flex-col gap-3">
          <input type="hidden" name="needId" value={needId} />
          <p className="text-sm">{CONFIRM[confirming].question}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              size="lg"
              variant={confirming === "reject" ? "destructive" : "default"}
              disabled={pending}
              aria-disabled={pending}
            >
              {CONFIRM[confirming].submit}
            </Button>
            <Button type="button" size="lg" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
              Cancelar
            </Button>
          </div>
          {pending && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {CONFIRM[confirming].pending}
            </p>
          )}
        </form>
      )}
      {error && error.status === "error" && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      )}
    </section>
  );
}
