"use server";

import {
  flowErrorMessage,
  needCreatedState,
  parseNeedForm,
  publicationFromOutcome,
  readIdField,
  readNeedFormValues,
  receiptConfirmedState,
  type FlowActionState,
  type NeedActionState,
} from "@/lib/actions/flow-result";
import { requireActor } from "@/lib/auth/session";
import { confirmReceipt } from "@/lib/flow/commitments";
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

/**
 * La escuela confirma la recepción de una entrega reportada (SCHOOL_CONFIRMED):
 * delivery_reported → confirmed. Del formulario solo se toma el id del
 * compromiso; que sea de la escuela del actor, el estado y la transición los
 * comprueban el dominio y la RPC. Si lo confirmado alcanza la meta, la RPC
 * completa la necesidad (sin evento propio).
 *
 * Sin refresh(): la entrega sale de la lista de pendientes al recargar, y el
 * resultado se muestra en su lugar hasta que la escuela actualice el panel.
 */
export async function confirmReceiptAction(_prev: FlowActionState, formData: FormData): Promise<FlowActionState> {
  const actor = await requireActor(["school_rep"]);

  const commitmentId = readIdField(formData, "commitmentId");
  if (!commitmentId) return { status: "error", message: "Identificador de compromiso inválido." };

  let result: { eventId: string; needCompleted: boolean };
  try {
    result = await confirmReceipt(actor, { commitmentId });
  } catch (error) {
    return { status: "error", message: flowErrorMessage(error) };
  }

  const outcome = await publishEvent(result.eventId).catch((error: unknown) => {
    console.error(`publishEvent(${result.eventId}) falló; el evento queda en el outbox`, error);
    return null;
  });
  return receiptConfirmedState(result.eventId, publicationFromOutcome(outcome), result.needCompleted);
}
