"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createCommitmentAction } from "@/app/panel/aliado/actions";
import { Button } from "@/components/ui/button";
import { IDLE, type FlowActionState } from "@/lib/actions/flow-result";

const inputClass =
  "h-11 w-full rounded-lg border bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

/**
 * Formulario de compromiso. Solo envía la necesidad y la cantidad: el aliado
 * sale de la sesión y el disponible lo vuelve a comprobar el servidor. Tras
 * registrar, el formulario se reemplaza por el resultado (evita un segundo
 * compromiso por doble envío).
 */
export function CommitmentForm({ needId, unit }: { needId: string; unit: string }) {
  const [state, formAction, pending] = useActionState<FlowActionState, FormData>(createCommitmentAction, IDLE);

  if (state.status === "success") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-5">
        <p className="font-semibold">{state.message}</p>
        <p className="text-sm text-muted-foreground">
          Cuando realices la entrega, repórtala desde tu panel. La escuela confirmará la recepción.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
          <Link href="/panel/aliado" className="text-primary underline-offset-4 hover:underline">
            Ir a mis compromisos
          </Link>
          {state.eventId && (
            <Link href={`/verify/${state.eventId}`} className="text-primary underline-offset-4 hover:underline">
              Ver verificación del registro
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="needId" value={needId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="quantity" className="text-sm font-medium">
          Cantidad a comprometer ({unit})
        </label>
        <input
          id="quantity"
          name="quantity"
          inputMode="decimal"
          required
          defaultValue={state.status === "error" ? state.quantity : undefined}
          className={inputClass}
        />
        <p className="text-xs text-muted-foreground">Por ejemplo: 5 o 2,5. Máximo 2 decimales.</p>
      </div>

      {state.status === "error" && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" className="h-11 text-base" disabled={pending} aria-disabled={pending}>
          {pending ? "Registrando…" : "Comprometer apoyo"}
        </Button>
        <Link href="/panel/aliado" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Cancelar
        </Link>
      </div>
      {pending && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Registrando el compromiso y publicando su registro en Hedera. Puede tardar unos segundos.
        </p>
      )}
    </form>
  );
}
