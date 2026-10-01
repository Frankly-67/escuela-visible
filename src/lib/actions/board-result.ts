/**
 * Traducción entre las Server Actions del tablón y la interfaz. Funciones
 * puras: sin I/O.
 *
 * - El formulario solo aporta tipo, título, texto y fecha. Cualquier otro
 *   campo (schoolId, role, userId…) se ignora: la escuela sale de la sesión.
 * - Las reglas (longitudes, privacidad) son las de createBoardPostInputSchema.
 * - Los mensajes nunca incluyen errores internos: solo los de FlowError o uno
 *   genérico (flowErrorMessage).
 * - Sin Hedera: estos estados no tienen eventId ni estado de publicación.
 */
import type { CreateBoardPostInput } from "@/lib/board/schemas";

export type BoardFormValues = { kind: string; title: string; body: string; eventDate: string };

export type BoardActionState =
  | { status: "idle" }
  | { status: "error"; message: string; values?: BoardFormValues }
  | { status: "success"; message: string };

export const BOARD_IDLE: BoardActionState = { status: "idle" };

const FIELDS = ["kind", "title", "body", "eventDate"] as const;

type FormLike = { get(name: string): unknown };

export function readBoardFormValues(form: FormLike): BoardFormValues {
  return Object.fromEntries(
    FIELDS.map((f) => {
      const value = form.get(f);
      return [f, typeof value === "string" ? value : ""];
    }),
  ) as BoardFormValues;
}

/** Formulario → input de createPost SIN schoolId (lo añade la acción con actor.schoolId). */
export function parseBoardPostForm(form: FormLike): { input: Omit<CreateBoardPostInput, "schoolId">; values: BoardFormValues } {
  const values = readBoardFormValues(form);
  return {
    values,
    input: {
      kind: values.kind as CreateBoardPostInput["kind"],
      title: values.title,
      body: values.body,
      eventDate: values.eventDate.trim() === "" ? null : values.eventDate.trim(),
    },
  };
}

export const postCreatedState = (): BoardActionState => ({
  status: "success",
  message: "Publicación enviada. Queda pendiente de revisión: no será pública hasta que Escuela Visible la apruebe.",
});

export const postPublishedState = (): BoardActionState => ({
  status: "success",
  message: "Publicación aprobada. Ya es pública en el tablón.",
});

export const postRejectedState = (): BoardActionState => ({
  status: "success",
  message: "Publicación no aprobada. No se mostrará en el tablón.",
});
