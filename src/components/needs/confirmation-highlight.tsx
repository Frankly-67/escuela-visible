import Link from "next/link";

import { formatDate, formatQuantity } from "@/lib/domain/labels";

/** Bloque destacado: lo que la escuela confirmó haber recibido. */
export function ConfirmationHighlight({
  total,
  unit,
  confirmedAt,
  verificationEventId,
}: {
  total: number;
  unit: string;
  confirmedAt: string;
  verificationEventId: string | null;
}) {
  return (
    <section
      aria-labelledby="confirmacion"
      className="flex flex-col gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <h2 id="confirmacion" className="font-sans text-lg font-semibold">
            La escuela confirmó la recepción de {formatQuantity(total, unit)}
          </h2>
          <p className="text-sm text-muted-foreground">Confirmado el {formatDate(confirmedAt)}.</p>
        </div>
      </div>
      {verificationEventId && (
        <Link
          href={`/verify/${verificationEventId}`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline sm:shrink-0"
        >
          Ver verificación de la confirmación
        </Link>
      )}
    </section>
  );
}
