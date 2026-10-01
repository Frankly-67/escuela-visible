import Link from "next/link";

import { formatDateTime } from "@/lib/domain/labels";
import type { TimelineStep } from "@/lib/domain/timeline";

/**
 * Historia de la necesidad en lenguaje sencillo: paso, rol, fecha, número de
 * registro en Hedera y enlace a la verificación en vivo. No afirma que un paso
 * esté "verificado": eso se comprueba en /verify/[id].
 */
export function NeedTimeline({ steps }: { steps: TimelineStep[] }) {
  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay pasos registrados para esta necesidad.</p>;
  }
  return (
    <ol className="relative flex flex-col gap-6 border-l-2 border-primary/20 pl-6">
      {steps.map((step, index) => {
        const isConfirmation = step.eventType === "SCHOOL_CONFIRMED";
        return (
          <li key={step.eventId} className="relative">
            <span
              aria-hidden
              className={`absolute top-1 -left-[2.0625rem] grid size-6 place-items-center rounded-full border-2 border-background text-[0.65rem] font-semibold tabular-nums ${
                isConfirmation ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {index + 1}
            </span>
            <div className="flex flex-col gap-1">
              <h3 className={`font-sans text-base font-semibold ${isConfirmation ? "text-primary" : ""}`}>{step.title}</h3>
              <p className="text-sm">{step.description}</p>
              <p className="text-xs text-muted-foreground">
                {step.actor} · {formatDateTime(step.recordedAt)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  {step.registryNumber !== null ? `Registro n.º ${step.registryNumber} en Hedera` : "Pendiente de publicación en Hedera"}
                </span>
                <Link
                  href={`/verify/${step.eventId}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  aria-label={`Ver verificación: ${step.title}`}
                >
                  Ver verificación
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
