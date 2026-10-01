/**
 * Traducción entre las Server Actions de necesidades y la interfaz.
 * Funciones puras: sin I/O.
 *
 * - El formulario solo aporta los datos de la necesidad. Cualquier otro campo
 *   (schoolId, role, userId…) se ignora: la escuela sale del actor en sesión.
 * - Las validaciones de negocio son las del schema existente
 *   (createNeedInputSchema); aquí solo se convierte el texto del formulario.
 * - Los mensajes nunca incluyen errores internos (Supabase, SDK de Hedera,
 *   submission_error): solo los mensajes de FlowError o uno genérico.
 */
import type { CreateNeedInput } from "@/lib/flow/schemas";
import { FlowError } from "@/lib/flow/errors";
import type { PublishOutcome } from "@/lib/hedera/publish";
import { Constants } from "@/types/database";

const E = Constants.public.Enums;

/** Estado que devuelven las acciones a la interfaz (useActionState). */
export type NeedActionState =
  | { status: "idle" }
  | { status: "error"; message: string; values?: NeedFormValues }
  | {
      status: "success";
      message: string;
      /** Evento a enlazar en /verify (null si el paso no genera evento). */
      eventId: string | null;
      publication: Publication;
    };

/** Estado de publicación en Hedera, tal como se guardó (no es una verificación). */
export type Publication = "published" | "pending" | "none";

export const IDLE: NeedActionState = { status: "idle" };

export const GENERIC_ERROR = "No se pudo completar la operación. Intenta de nuevo.";

// --- Formulario de necesidad ---------------------------------------------------

/** Valores tal como se escribieron (para no perderlos si hay un error). */
export type NeedFormValues = {
  kind: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  goalQuantity: string;
  goalUnit: string;
  eventDate: string;
};

const FIELDS = ["kind", "title", "description", "category", "priority", "goalQuantity", "goalUnit", "eventDate"] as const;

type FormLike = { get(name: string): unknown };

const text = (form: FormLike, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export function readNeedFormValues(form: FormLike): NeedFormValues {
  return Object.fromEntries(FIELDS.map((f) => [f, text(form, f)])) as NeedFormValues;
}

/** "20", "1,5" o "1.5" → número. Otra cosa → null. */
export function parseQuantity(value: string): number | null {
  const v = value.trim();
  if (!/^\d+([.,]\d+)?$/.test(v)) return null;
  return Number(v.replace(",", "."));
}

export type ParsedNeedForm =
  | { ok: true; input: Omit<CreateNeedInput, "schoolId"> }
  | { ok: false; message: string; values: NeedFormValues };

/**
 * Convierte el formulario en el input de createNeed SIN schoolId (lo añade la
 * acción con actor.schoolId). Solo comprueba el formato de los campos; las
 * reglas (longitudes, meta > 0, decimales) las aplica el schema existente.
 */
export function parseNeedForm(form: FormLike): ParsedNeedForm {
  const values = readNeedFormValues(form);
  const fail = (message: string): ParsedNeedForm => ({ ok: false, message, values });

  if (values.kind && !(E.need_kind as readonly string[]).includes(values.kind)) return fail("Elige un tipo válido.");
  if (!(E.need_category as readonly string[]).includes(values.category)) return fail("Elige una categoría.");
  if (values.priority && !(E.need_priority as readonly string[]).includes(values.priority)) {
    return fail("Elige una prioridad válida.");
  }
  const goalQuantity = parseQuantity(values.goalQuantity);
  if (goalQuantity === null) return fail("Escribe la meta como un número (por ejemplo, 20 o 1,5).");

  return {
    ok: true,
    input: {
      kind: (values.kind || undefined) as CreateNeedInput["kind"],
      title: values.title,
      description: values.description,
      category: values.category as CreateNeedInput["category"],
      priority: (values.priority || undefined) as CreateNeedInput["priority"],
      goalQuantity,
      goalUnit: values.goalUnit,
      eventDate: values.eventDate.trim() === "" ? null : values.eventDate.trim(),
    },
  };
}

// --- Errores y publicación -------------------------------------------------------

/** Mensaje para la interfaz: el de FlowError (ya en español y sin detalles) o uno genérico. */
export function flowErrorMessage(error: unknown): string {
  if (error instanceof FlowError && error.code !== "UNKNOWN") return error.message;
  return GENERIC_ERROR;
}

/**
 * Resultado de publishEvent → estado mostrado. Solo "submitted" o
 * "already_submitted" cuentan como publicado; cualquier otro resultado (o una
 * excepción, `null`) queda como pendiente: el evento está guardado en el
 * outbox y se puede publicar después.
 */
export function publicationFromOutcome(outcome: PublishOutcome | null): Publication {
  return outcome?.status === "submitted" || outcome?.status === "already_submitted" ? "published" : "pending";
}

const PUBLICATION_TEXT: Record<Exclude<Publication, "none">, string> = {
  published: "El registro de este paso ya está publicado en Hedera.",
  pending: "La publicación del registro en Hedera quedó pendiente; el paso ya está guardado en Escuela Visible.",
};

export function needCreatedState(eventId: string, publication: Publication): NeedActionState {
  return {
    status: "success",
    message: `Necesidad registrada. Queda pendiente de validación. ${publication === "none" ? "" : PUBLICATION_TEXT[publication]}`.trim(),
    eventId,
    publication,
  };
}

export function needValidatedState(eventId: string, publication: Publication): NeedActionState {
  return {
    status: "success",
    message: `Necesidad validada: ya es pública y puede recibir apoyos. ${publication === "none" ? "" : PUBLICATION_TEXT[publication]}`.trim(),
    eventId,
    publication,
  };
}

export function needRejectedState(): NeedActionState {
  return {
    status: "success",
    message: "La necesidad quedó como no aprobada. Este paso no se publica en Hedera.",
    eventId: null,
    publication: "none",
  };
}
