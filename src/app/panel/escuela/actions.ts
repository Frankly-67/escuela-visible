"use server";

import {
  flowErrorMessage,
  needCreatedState,
  parseNeedForm,
  publicationFromOutcome,
  readNeedFormValues,
  type NeedActionState,
} from "@/lib/actions/flow-result";
import { requireActor } from "@/lib/auth/session";
import { createNeed } from "@/lib/flow/needs";
import { publishEvent } from "@/lib/hedera/publish";

/**
 * La escuela registra una necesidad (NEED_CREATED).
 *
 * - Exige sesión de school_rep aquí mismo (una Server Action es un endpoint
 *   público; que el formulario esté en una página protegida no basta).
 * - La escuela es SIEMPRE actor.schoolId: cualquier schoolId, role o userId
 *   del formulario se ignora.
 * - createNeed valida datos y permiso y registra la necesidad y su evento en
 *   una transacción; después se publica el evento con el outbox existente.
 *   Si la publicación no termina, el paso queda guardado y se informa como
 *   pendiente.
 */
export async function createNeedAction(_prev: NeedActionState, formData: FormData): Promise<NeedActionState> {
  const actor = await requireActor(["school_rep"]);
  if (!actor.schoolId) return { status: "error", message: "Esta cuenta no tiene una escuela asociada." };

  const parsed = parseNeedForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message, values: parsed.values };

  let eventId: string;
  try {
    ({ eventId } = await createNeed(actor, { ...parsed.input, schoolId: actor.schoolId }));
  } catch (error) {
    return { status: "error", message: flowErrorMessage(error), values: readNeedFormValues(formData) };
  }

  const outcome = await publishEvent(eventId).catch((error: unknown) => {
    console.error(`publishEvent(${eventId}) falló; el evento queda en el outbox`, error);
    return null;
  });
  return needCreatedState(eventId, publicationFromOutcome(outcome));
}
