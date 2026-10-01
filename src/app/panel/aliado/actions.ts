"use server";

import {
  commitmentCreatedState,
  deliveryReportedState,
  flowErrorMessage,
  parseCommitmentForm,
  publicationFromOutcome,
  readIdField,
  type FlowActionState,
} from "@/lib/actions/flow-result";
import { requireActor } from "@/lib/auth/session";
import { createCommitment, reportDelivery } from "@/lib/flow/commitments";
import { publishEvent } from "@/lib/hedera/publish";

/*
 * Acciones del aliado. Cada una exige sesión de supporter por sí misma (una
 * Server Action es un endpoint público). El aliado es SIEMPRE el actor en
 * sesión: el formulario solo aporta la referencia (necesidad o compromiso) y
 * la cantidad; supporterId, userId, schoolId o role enviados se ignoran.
 * Permisos, dueño, estado, transición y cantidad disponible los comprueban el
 * dominio y la RPC. Sin notas (note / delivery_note = null).
 */

const publish = (eventId: string) =>
  publishEvent(eventId).catch((error: unknown) => {
    console.error(`publishEvent(${eventId}) falló; el evento queda en el outbox`, error);
    return null;
  });

/** Nuevo compromiso (COMMITMENT_CREATED) sobre una necesidad publicada. */
export async function createCommitmentAction(_prev: FlowActionState, formData: FormData): Promise<FlowActionState> {
  const actor = await requireActor(["supporter"]);

  const parsed = parseCommitmentForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message, quantity: parsed.quantity };

  let eventId: string;
  try {
    ({ eventId } = await createCommitment(actor, parsed.input));
  } catch (error) {
    return { status: "error", message: flowErrorMessage(error), quantity: String(formData.get("quantity") ?? "") };
  }

  return commitmentCreatedState(eventId, publicationFromOutcome(await publish(eventId)));
}

/**
 * committed → delivery_reported (DELIVERY_REPORTED). Solo el mismo aliado. No
 * es recepción. Sin refresh(): el resultado se muestra en la tarjeta hasta que
 * el aliado actualice el panel (igual que la confirmación de la escuela).
 */
export async function reportDeliveryAction(_prev: FlowActionState, formData: FormData): Promise<FlowActionState> {
  const actor = await requireActor(["supporter"]);

  const commitmentId = readIdField(formData, "commitmentId");
  if (!commitmentId) return { status: "error", message: "Identificador de compromiso inválido." };

  let eventId: string;
  try {
    ({ eventId } = await reportDelivery(actor, { commitmentId, deliveryNote: null }));
  } catch (error) {
    return { status: "error", message: flowErrorMessage(error) };
  }

  return deliveryReportedState(eventId, publicationFromOutcome(await publish(eventId)));
}
