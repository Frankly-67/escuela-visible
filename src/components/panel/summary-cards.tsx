import Link from "next/link";

export type SummaryItem = {
  label: string;
  value: number;
  /** Texto breve bajo el número (opcional). */
  hint?: string;
  /** Si se indica, la tarjeta es un enlace (p. ej. filtro ?estado=). */
  href?: string;
  /** Marca la tarjeta del filtro activo. */
  active?: boolean;
};

/** Resumen en tarjetas: número y etiqueta. Dos columnas en móvil. */
export function SummaryCards({ items, label }: { items: SummaryItem[]; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
      {items.map((item) => {
        const body = (
          <>
            <span className="text-3xl font-semibold tabular-nums">{item.value}</span>
            <span className="text-sm font-medium">{item.label}</span>
            {item.hint && <span className="text-xs text-muted-foreground">{item.hint}</span>}
          </>
        );
        const base = "flex h-full flex-col gap-1 rounded-xl border bg-card p-4";
        return (
          <li key={item.label}>
            {item.href ? (
              <Link
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={`${base} transition-colors hover:border-primary/50 ${item.active ? "border-primary bg-primary/5" : ""}`}
              >
                {body}
              </Link>
            ) : (
              <div className={base}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
