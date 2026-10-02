"use server";

import { refresh } from "next/cache";

import { postPublishedState, postRejectedState, type BoardActionState } from "@/lib/actions/board-result";
import {
  flowErrorMessage,
  needRejectedState,
  needValidatedState,
  publicationFromOutcome,
  type NeedActionState,
} from "@/lib/actions/flow-result";
import { requireActor } from "@/lib/auth/session";
import { publishPost, rejectPost } from "@/lib/board/posts";
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

/*
 * Revisión de publicaciones del tablón. Mismo patrón: sesión de admin en cada
 * acción; del formulario solo se toma el id; el estado se lee de la base. Sin
 * eventos ni publicación en Hedera.
 *
 * Sin refresh(): la lista solo muestra pendientes, así que refrescarla quitaría
 * la publicación revisada junto con el mensaje del resultado. El resultado se
 * muestra en su lugar hasta que el admin recargue la página.
 */
const postIdFrom = (formData: FormData) => {
  const value = formData.get("postId");
  return typeof value === "string" ? value : "";
};

/** pending_review → published: desde ahora es pública en el tablón. */
export async function publishPostAction(_prev: BoardActionState, formData: FormData): Promise<BoardActionState> {
  const actor = await requireActor(["admin"]);
  try {
    await publishPost(actor, postIdFrom(formData));
  } catch (error) {
    return { status: "error", message: flowErrorMessage(error) };
  }
  return postPublishedState();
}

/** pending_review → rejected: nunca se muestra en el tablón. */
export async function rejectPostAction(_prev: BoardActionState, formData: FormData): Promise<BoardActionState> {
  const actor = await requireActor(["admin"]);
  try {
    await rejectPost(actor, postIdFrom(formData));
  } catch (error) {
    return { status: "error", message: flowErrorMessage(error) };
  }
  return postRejectedState();
}
