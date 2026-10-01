import "server-only";

import { getHederaPublicConfig } from "@/lib/env.server";
import { getTopicMessage } from "@/lib/hedera/mirror";
import { createClient } from "@/lib/supabase/server";
import { verifyEvent, type LocalEvent, type VerificationResult } from "@/lib/verify/verify-event";

/**
 * Verificación pública EN VIVO de un evento:
 *  1. lee el evento con el cliente del visitante (RLS: solo eventos de
 *     necesidades públicas) y solo las columnas que la verificación necesita;
 *  2. consulta el Mirror Node en el momento (sin caché);
 *  3. compara con verifyEvent (13 comprobaciones).
 * El estado nunca sale de Supabase: si Hedera no responde, es UNAVAILABLE.
 */
const EVENT_FIELDS =
  "id, event_type, need_id, school_id, commitment_id, actor_role, payload_canonical, payload_hash, submission_status, topic_id, sequence_number, consensus_timestamp, transaction_id, created_at";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type EventVerification = {
  event: LocalEvent & { transactionId: string | null; createdAt: string };
  result: VerificationResult;
  checkedAt: string;
  network: ReturnType<typeof getHederaPublicConfig>["HEDERA_NETWORK"];
};

export async function verifyEventLive(eventId: string): Promise<EventVerification | null> {
  if (!UUID.test(eventId)) return null;

  const supabase = await createClient();
  const { data: row, error } = await supabase.from("hedera_events").select(EVENT_FIELDS).eq("id", eventId).maybeSingle();
  if (error) throw new Error(`No se pudo leer el registro: ${error.message}`);
  if (!row) return null;

  const config = getHederaPublicConfig();
  const local: LocalEvent = {
    id: row.id,
    eventType: row.event_type,
    needId: row.need_id,
    schoolId: row.school_id,
    commitmentId: row.commitment_id,
    actorRole: row.actor_role,
    payloadCanonical: row.payload_canonical,
    payloadHash: row.payload_hash,
    submissionStatus: row.submission_status,
    topicId: row.topic_id,
    sequenceNumber: row.sequence_number,
    consensusTimestamp: row.consensus_timestamp,
  };

  const mirror =
    local.submissionStatus === "submitted" && local.topicId && local.sequenceNumber !== null
      ? await getTopicMessage({
          mirrorUrl: config.HEDERA_MIRROR_NODE_URL,
          topicId: local.topicId,
          sequenceNumber: local.sequenceNumber,
        })
      : null;

  const result = verifyEvent(local, mirror, {
    expectedTopicId: config.HEDERA_TOPIC_ID,
    operatorAccountId: config.HEDERA_OPERATOR_ID,
  });

  return {
    event: { ...local, transactionId: row.transaction_id, createdAt: row.created_at },
    result,
    checkedAt: new Date().toISOString(),
    network: config.HEDERA_NETWORK,
  };
}
