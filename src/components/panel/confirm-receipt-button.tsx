"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { confirmReceiptAction } from "@/app/panel/escuela/actions";
import { Button } from "@/components/ui/button";
import { IDLE, type FlowActionState } from "@/lib/actions/flow-result";

/**
 * "Confirmar recepción" de una entrega reportada por un aliado. Solo se usa en
 * la lista de entregas pendientes de la escuela. Tras confirmar muestra el
 * resultado (y si la necesidad se completó); la lista se actualiza al recargar.
 */
export function ConfirmReceiptButton({ commitmentId, quantityText }: { commitmentId: string; quantityText: string }) {
  const [state, formAction, pending] = useActionState<FlowActionState, FormData>(confirmReceiptAction, IDLE);
  const [confirming, setConfirming] = useState(false);

  if (state.status === "success") {
    return (
      <div role="status" className="flex flex-col gap-1 rounded-lg border-2 border-primary/30 bg-primary/5 p-3 text-sm">
        <p className="font-semibold">{state.message}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {state.eventId && (
            <Link href={`/verify/${state.eventId}`} className="font-medium text-primary underline-offset-4 hover:underline">
              Ver verificación del registro
            </Link>
          )}
          <Link href="/panel/escuela" className="font-medium text-primary underline-offset-4 hover:underline">
            Actualizar el panel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!confirming ? (
        <Button type="button" className="self-start" onClick={() => setConfirming(true)}>
          Confirmar recepción
        </Button>
      ) : (
        <form action={formAction} className="flex flex-col gap-2 rounded-lg border p-3">
          <input type="hidden" name="commitmentId" value={commitmentId} />
          <p className="text-sm">¿Confirmas que la escuela recibió {quantityText}?</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending} aria-disabled={pending}>
              {pending ? "Confirmando…" : "Sí, confirmar recepción"}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {state.status === "error" && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}
    </div>
  );
}
