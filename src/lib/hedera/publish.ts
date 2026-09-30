import "server-only";

import { getHederaEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

import { createHederaClient } from "./client";
import { getTopicMessage, listTopicMessages } from "./mirror";
import { canResubmit, findEventMessage, OutboxIntegrityError, rebuildHcsMessage, toHederaTimestamp } from "./outbox";
import { executeTopicMessage, prepareTopicMessage } from "./submit";

export type PublishOutcome =
  | {
      status: "submitted";
      sequenceNumber: number;
      transactionId: string | null;
      consensusTimestamp: string | null;
      /** true si no se envió nada: un intento anterior ya estaba en el topic. */
      reconciled: boolean;
    }
  | { status: "already_submitted" }
  | { status: "in_flight"; detail: string }
  | { status: "retry_later"; detail: string }
  | { status: "failed"; error: string };

const sanitize = (error: unknown) => (error instanceof Error ? error.message : "error desconocido").slice(0, 500);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Publica en HCS un evento YA registrado en hedera_events (outbox).
 *
 *  1. Si ya está `submitted`, no hace nada.
 *  2. Si hubo un intento anterior, primero busca el evento en el topic por
 *     contenido; si ya está, solo reconcilia la fila (no reenvía). Si aún
 *     podría llegar a consenso, espera (in_flight).
 *  3. Reconstruye el mensaje desde payload_canonical/payload_hash guardados y
 *     se niega a publicar una fila no íntegra.
 *  4. Registra el transaction_id ANTES de enviar, envía, y guarda
 *     sequence_number (+ consensus_timestamp si el Mirror Node ya lo indexó).
 *
 * Solo actualiza los campos de envío; el contenido del evento es inmutable
 * (trigger en la base de datos).
 */
export async function publishEvent(eventId: string): Promise<PublishOutcome> {
  const env = getHederaEnv();
  const db = createAdminClient();
  const mirror = { mirrorUrl: env.HEDERA_MIRROR_NODE_URL };

  const { data: row, error } = await db
    .from("hedera_events")
    .select("id, payload_canonical, payload_hash, submission_status, transaction_id, attempts, created_at")
    .eq("id", eventId)
    .single();
  if (error || !row) throw new Error(`Evento ${eventId} no encontrado: ${error?.message ?? "sin datos"}`);
  if (row.submission_status === "submitted") return { status: "already_submitted" };

  const markSubmitted = async (fields: {
    sequenceNumber: number;
    transactionId: string | null;
    consensusTimestamp: string | null;
    reconciled: boolean;
  }): Promise<PublishOutcome> => {
    const { error: updateError } = await db
      .from("hedera_events")
      .update({
        submission_status: "submitted",
        topic_id: env.HEDERA_TOPIC_ID,
        sequence_number: fields.sequenceNumber,
        consensus_timestamp: fields.consensusTimestamp,
        ...(fields.transactionId ? { transaction_id: fields.transactionId } : {}),
        submission_error: null,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    if (updateError) {
      // El mensaje SÍ está en Hedera; el próximo intento lo reconciliará por contenido.
      throw new Error(`Publicado en Hedera (secuencia ${fields.sequenceNumber}) pero no se pudo guardar: ${updateError.message}`);
    }
    return { status: "submitted", ...fields };
  };

  const markFailed = async (message: string): Promise<PublishOutcome> => {
    await db.from("hedera_events").update({ submission_status: "failed", submission_error: message }).eq("id", eventId);
    return { status: "failed", error: message };
  };

  // --- 2. Reconciliación de un intento anterior ------------------------------
  if (row.transaction_id) {
    const listed = await listTopicMessages({
      ...mirror,
      topicId: env.HEDERA_TOPIC_ID,
      fromTimestamp: toHederaTimestamp(row.created_at, 5),
    });
    if (listed.kind === "unavailable") {
      return { status: "retry_later", detail: `Mirror Node no disponible (${listed.reason}); no se reenvía a ciegas.` };
    }
    const found = listed.kind === "found" ? findEventMessage(listed.data, eventId) : null;
    if (found) {
      return markSubmitted({
        sequenceNumber: found.sequenceNumber,
        transactionId: null,
        consensusTimestamp: found.consensusTimestamp,
        reconciled: true,
      });
    }
    if (!canResubmit(row.transaction_id, Math.floor(Date.now() / 1000))) {
      return { status: "in_flight", detail: "El intento anterior aún puede llegar a consenso; reintentar en unos minutos." };
    }
  }

  // --- 3. Mensaje desde lo guardado --------------------------------------------
  let message: string;
  try {
    message = rebuildHcsMessage({ id: row.id, payloadCanonical: row.payload_canonical, payloadHash: row.payload_hash });
  } catch (error) {
    if (error instanceof OutboxIntegrityError) return markFailed(`Integridad: ${error.message}`);
    throw error;
  }

  // --- 4. Envío --------------------------------------------------------------------
  const client = createHederaClient(env);
  try {
    const { transaction, transactionId } = prepareTopicMessage(client, env.HEDERA_TOPIC_ID, message);

    const { error: preError } = await db
      .from("hedera_events")
      .update({
        transaction_id: transactionId,
        topic_id: env.HEDERA_TOPIC_ID,
        attempts: row.attempts + 1,
        submission_error: null,
      })
      .eq("id", eventId);
    if (preError) return markFailed(`No se pudo registrar el intento antes de enviar: ${preError.message}`);

    let result: Awaited<ReturnType<typeof executeTopicMessage>>;
    try {
      result = await executeTopicMessage(client, transaction);
    } catch (error) {
      // Si llegó a consenso pese al error (p. ej. timeout del receipt), el
      // próximo intento lo encontrará por contenido y no duplicará.
      return markFailed(sanitize(error));
    }

    // Marca de consenso: el Mirror Node suele indexar en pocos segundos.
    let consensusTimestamp: string | null = null;
    for (let i = 0; i < 5 && !consensusTimestamp; i++) {
      await sleep(1500);
      const lookup = await getTopicMessage({ ...mirror, topicId: env.HEDERA_TOPIC_ID, sequenceNumber: result.sequenceNumber });
      if (lookup.kind === "found") consensusTimestamp = lookup.data.consensusTimestamp;
    }

    return markSubmitted({
      sequenceNumber: result.sequenceNumber,
      transactionId: result.transactionId,
      consensusTimestamp,
      reconciled: false,
    });
  } finally {
    client.close();
  }
}
