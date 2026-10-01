"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createPostAction } from "@/app/panel/escuela/actions";
import { Button } from "@/components/ui/button";
import { BOARD_IDLE, type BoardActionState } from "@/lib/actions/board-result";
import { BOARD_KIND_LABEL } from "@/lib/domain/board";

const inputClass =
  "h-11 w-full rounded-lg border bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

/**
 * Formulario para enviar una publicación al tablón. No envía la escuela: la
 * acción la toma de la sesión. Tras enviar, el formulario se reemplaza por el
 * resultado (evita enviarla dos veces). Sin edición posterior.
 */
export function PostForm() {
  const [state, formAction, pending] = useActionState<BoardActionState, FormData>(createPostAction, BOARD_IDLE);

  if (state.status === "success") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-5">
        <p className="font-semibold">{state.message}</p>
        <Link href="/panel/escuela" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Volver al panel
        </Link>
      </div>
    );
  }

  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div
        role="note"
        className="flex flex-col gap-1 rounded-xl border border-accent bg-accent/40 p-4 text-sm text-accent-foreground"
      >
        <p className="font-semibold">Protege la privacidad de los estudiantes</p>
        <p>
          No incluyas nombres de estudiantes, teléfonos, correos electrónicos ni direcciones. Escribe de forma general
          (por ejemplo, «los estudiantes de primaria presentarán una obra de teatro»).
        </p>
        <p>
          Escuela Visible revisará la publicación antes de mostrarla. Después de enviarla no se puede editar. No se
          admiten precios, pagos ni donaciones.
        </p>
      </div>

      <Field label="Tipo de publicación" htmlFor="kind">
        <select id="kind" name="kind" required defaultValue={values?.kind ?? ""} className={inputClass}>
          <option value="" disabled>
            Elige un tipo
          </option>
          {Object.entries(BOARD_KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Título" htmlFor="title">
        <input id="title" name="title" required maxLength={120} defaultValue={values?.title} className={inputClass} />
      </Field>

      <Field label="Texto" htmlFor="body" hint="Opcional. Máximo 2000 caracteres.">
        <textarea
          id="body"
          name="body"
          rows={6}
          maxLength={2000}
          defaultValue={values?.body}
          className={`${inputClass} h-auto py-2`}
        />
      </Field>

      <Field label="Fecha" htmlFor="eventDate" hint="Opcional (por ejemplo, el día del bazar o de la actividad).">
        <input id="eventDate" name="eventDate" type="date" defaultValue={values?.eventDate} className={inputClass} />
      </Field>

      {state.status === "error" && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" className="h-11 text-base" disabled={pending} aria-disabled={pending}>
          {pending ? "Enviando…" : "Enviar a revisión"}
        </Button>
        <Link href="/panel/escuela" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
