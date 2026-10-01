"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createNeedAction } from "@/app/panel/escuela/actions";
import { Button } from "@/components/ui/button";
import { IDLE, type NeedActionState } from "@/lib/actions/flow-result";
import { CATEGORY_LABEL, NEED_KIND_LABEL, PRIORITY_LABEL } from "@/lib/domain/labels";

const inputClass =
  "h-11 w-full rounded-lg border bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

/**
 * Formulario para registrar una necesidad. No envía la escuela: la acción la
 * toma de la sesión. Tras registrar, el formulario se reemplaza por el
 * resultado (evita registrar dos veces la misma necesidad).
 */
export function NeedForm() {
  const [state, formAction, pending] = useActionState<NeedActionState, FormData>(createNeedAction, IDLE);

  if (state.status === "success") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-5">
        <p className="font-semibold">{state.message}</p>
        <p className="text-sm text-muted-foreground">
          La necesidad no es pública hasta que Escuela Visible la valide.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
          <Link href="/panel/escuela" className="text-primary underline-offset-4 hover:underline">
            Volver al panel
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

  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div
        role="note"
        className="flex flex-col gap-1 rounded-xl border border-accent bg-accent/40 p-4 text-sm text-accent-foreground"
      >
        <p className="font-semibold">Protege la privacidad de los estudiantes</p>
        <p>
          No incluyas nombres de menores, fotografías, direcciones particulares ni datos médicos. Expresa las necesidades
          de forma agregada (por ejemplo, «20 kits escolares para 20 estudiantes»).
        </p>
      </div>

      <Field label="Tipo" htmlFor="kind">
        <select id="kind" name="kind" defaultValue={values?.kind || "need"} className={inputClass}>
          {Object.entries(NEED_KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Título" htmlFor="title">
        <input id="title" name="title" required maxLength={120} defaultValue={values?.title} className={inputClass} />
      </Field>

      <Field label="Descripción" htmlFor="description" hint="Opcional.">
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={2000}
          defaultValue={values?.description}
          className={`${inputClass} h-auto py-2`}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Categoría" htmlFor="category">
          <select id="category" name="category" required defaultValue={values?.category ?? ""} className={inputClass}>
            <option value="" disabled>
              Elige una categoría
            </option>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prioridad" htmlFor="priority">
          <select id="priority" name="priority" defaultValue={values?.priority || "media"} className={inputClass}>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Meta (cantidad)" htmlFor="goalQuantity">
          <input
            id="goalQuantity"
            name="goalQuantity"
            inputMode="decimal"
            required
            defaultValue={values?.goalQuantity}
            className={inputClass}
          />
        </Field>
        <Field label="Unidad" htmlFor="goalUnit" hint="Por ejemplo: kits, metros, refrigerios.">
          <input id="goalUnit" name="goalUnit" required defaultValue={values?.goalUnit} className={inputClass} />
        </Field>
      </div>

      <Field label="Fecha" htmlFor="eventDate" hint="Opcional (por ejemplo, para una actividad comunitaria).">
        <input id="eventDate" name="eventDate" type="date" defaultValue={values?.eventDate} className={inputClass} />
      </Field>

      {state.status === "error" && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" className="h-11 text-base" disabled={pending} aria-disabled={pending}>
          {pending ? "Registrando…" : "Registrar necesidad"}
        </Button>
        <Link href="/panel/escuela" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Cancelar
        </Link>
      </div>
      {pending && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Guardando la necesidad y publicando su registro en Hedera. Puede tardar unos segundos.
        </p>
      )}
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
