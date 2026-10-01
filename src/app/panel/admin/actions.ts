"use server";

import { refresh } from "next/cache";

import {
  flowErrorMessage,
  needRejectedState,
  needValidatedState,
  publicationFromOutcome,
  type NeedActionState,
} from "@/lib/actions/flow-result";
import { requireActor } from "@/lib/auth/session";
import { rejectNeed, validateNeed } from "@/lib/flow/needs";
import { publishEvent } from "@/lib/hedera/publish";

/*
 * Revisión de necesidades por la administración. Cada acción exige sesión de
 * admin por sí misma. Del formulario solo se toma el id de la necesidad; el
 * estado y la escuela se leen de la base (validateNeed / rejectNeed), y el
 * permiso y la transición los comprueban el dominio y la RPC.
 */

const needIdFrom = (formData: FormData) => {
  const value = formData.get("needId");
  return typeof value === "string" ? value : "";
};

/** pending_validation → published (NEED_VALIDATED), y publicación del evento. */
export async function validateNeedAction(_prev: NeedActionState, formData: FormData): Promise<NeedActionState> {
  const actor = await requireActor(["admin"]);

  let eventId: string;
  try {
    ({ eventId } = await validateNeed(actor, needIdFrom(formData)));
  } catch (error) {
    return { status: "error", message: flowErrorMessage(error) };
  }

  const outcome = await publishEvent(eventId).catch((error: unknown) => {
    console.error(`publishEvent(${eventId}) falló; el evento queda en el outbox`, error);
    return null;
  });
  refresh();
  return needValidatedState(eventId, publicationFromOutcome(outcome));
}

/** pending_validation → cancelled. Sin evento ni publicación en Hedera. */
export async function rejectNeedAction(_prev: NeedActionState, formData: FormData): Promise<NeedActionState> {
  const actor = await requireActor(["admin"]);

  try {
    await rejectNeed(actor, needIdFrom(formData));
  } catch (error) {
    return { status: "error", message: flowErrorMessage(error) };
  }

  refresh();
  return needRejectedState();
}
