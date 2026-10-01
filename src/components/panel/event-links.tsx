import Link from "next/link";

import { EVENT_LABEL } from "@/lib/domain/labels";
import type { PanelEventDTO } from "@/lib/domain/panel";

/**
 * Pasos registrados de un compromiso con su número de registro en Hedera y un
 * enlace a /verify/[eventId]. No afirma que un paso esté comprobado: eso solo
 * lo dice la verificación en vivo de /verify.
 */
export function EventLinks({ events }: { events: PanelEventDTO[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay pasos registrados.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <li key={event.eventId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium">{EVENT_LABEL[event.type]}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {event.registryNumber !== null
              ? `Registro n.º ${event.registryNumber} en Hedera`
              : "Pendiente de publicación en Hedera"}
          </span>
          <Link
            href={`/verify/${event.eventId}`}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            aria-label={`Ver verificación: ${EVENT_LABEL[event.type]}`}
          >
            Ver verificación
          </Link>
        </li>
      ))}
    </ul>
  );
}
