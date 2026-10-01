import { formatConfirmedProgress, formatQuantity } from "@/lib/domain/labels";
import type { NeedProgress } from "@/lib/domain/progress";

/**
 * Dos barras: lo comprometido por aliados y lo confirmado por la escuela.
 * Solo la confirmación de la escuela cuenta como recibido; por eso el texto
 * principal (con porcentaje) se refiere a lo confirmado.
 */
export function NeedProgressBars({ progress, unit, compact = false }: { progress: NeedProgress; unit: string; compact?: boolean }) {
  const rows = [
    { label: "Comprometido", value: progress.committed, percent: progress.committedPercent, bar: "bg-primary/40" },
    { label: "Confirmado por la escuela", value: progress.confirmed, percent: progress.confirmedPercent, bar: "bg-primary" },
  ];
  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      <p className={compact ? "text-sm font-semibold" : "text-base font-semibold"}>
        {formatConfirmedProgress(progress.confirmed, progress.goal, unit, progress.confirmedPercent)}
      </p>
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium tabular-nums">
              {formatQuantity(row.value, unit)} de {formatQuantity(progress.goal, unit)}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={row.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={row.percent}
            aria-valuetext={`${row.percent} %`}
          >
            <div className={`h-full rounded-full ${row.bar}`} style={{ width: `${row.percent}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
