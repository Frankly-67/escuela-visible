"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { reportDeliveryAction } from "@/app/panel/aliado/actions";
import { Button } from "@/components/ui/button";
import { IDLE, type FlowActionState } from "@/lib/actions/flow-result";

/**
 * "Reportar entrega" de un compromiso del aliado. La tarjeta solo lo muestra
 * en `committed`. Tras reportar muestra el resultado; la tarjeta se actualiza
 * al recargar el panel. Reportar NO es recibir: lo confirma la escuela.
 */
export function ReportDeliveryButton({ commitmentId, quantityText }: { commitmentId: string; quantityText: string }) {
  const [state, formAction, pending] = useActionState<FlowActionState, FormData>(reportDeliveryAction, IDLE);
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
          <Link href="/panel/aliado" className="font-medium text-primary underline-offset-4 hover:underline">
            Actualizar el panel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!confirming ? (
        <Button type="button" variant="outline" className="self-start" onClick={() => setConfirming(true)}>
          Reportar entrega
        </Button>
      ) : (
        <form action={formAction} className="flex flex-col gap-2 rounded-lg border p-3">
          <input type="hidden" name="commitmentId" value={commitmentId} />
          <p className="text-sm">
            ¿Confirmas que ya entregaste {quantityText}? La escuela deberá confirmar la recepción.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending} aria-disabled={pending}>
              {pending ? "Reportando…" : "Sí, reportar entrega"}
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
