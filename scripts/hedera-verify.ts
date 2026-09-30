/**
 * Verifica un evento contra Hedera. SOLO LECTURA: no escribe en Supabase
 * ni envía nada a Hedera.
 *
 * Uso: npm run hedera:verify -- <eventId>
 */
import "./lib/load-env";

import { getHederaEnv } from "@/lib/env.server";
import { hashscanTopicUrl, hashscanTransactionUrl } from "@/lib/hedera/links";
import { getTopicMessage } from "@/lib/hedera/mirror";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromEventRow, verifyEvent, type VerificationStatus } from "@/lib/verify/verify-event";

const STATUS_TEXT: Record<VerificationStatus, string> = {
  VERIFIED: "VERIFICADO — el evento registrado por Escuela Visible coincide con el registro publicado en Hedera",
  PENDING: "PENDIENTE — el evento está registrado pero aún no se ha publicado en Hedera",
  PUBLISH_FAILED: "ERROR DE PUBLICACIÓN — se puede reintentar",
  AWAITING_MIRROR: "PUBLICADO, ESPERANDO AL MIRROR NODE — normalmente tarda unos segundos",
  UNAVAILABLE: "NO DISPONIBLE — no se pudo consultar Hedera; no indica ninguna alteración",
  MISMATCH: "NO COINCIDE — el registro local y el publicado en Hedera difieren",
};

async function main() {
  const eventId = process.argv[2];
  if (!eventId || !/^[0-9a-f-]{36}$/.test(eventId)) {
    console.error("Uso: npm run hedera:verify -- <eventId (UUID)>");
    process.exitCode = 2;
    return;
  }

  const env = getHederaEnv();
  const { data: row, error } = await createAdminClient().from("hedera_events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) {
    console.error(`No existe el evento ${eventId} en hedera_events.`);
    process.exitCode = 1;
    return;
  }

  const local = fromEventRow(row);
  const mirror =
    local.submissionStatus === "submitted" && local.sequenceNumber !== null && local.topicId
      ? await getTopicMessage({ mirrorUrl: env.HEDERA_MIRROR_NODE_URL, topicId: local.topicId, sequenceNumber: local.sequenceNumber })
      : null;

  const result = verifyEvent(local, mirror, {
    expectedTopicId: env.HEDERA_TOPIC_ID,
    operatorAccountId: env.HEDERA_OPERATOR_ID,
  });

  console.log(`Evento   ${local.id} (${local.eventType})`);
  console.log(`Estado   ${STATUS_TEXT[result.status]}`);
  if (result.unavailableReason) console.log(`Motivo   ${result.unavailableReason}`);
  console.log("");
  for (const check of result.checks) {
    const mark = check.outcome === "pass" ? "✓" : check.outcome === "fail" ? "✗" : "·";
    console.log(`${mark} ${String(check.step).padStart(2)}. ${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
  }
  if (result.remote) {
    console.log("");
    console.log(`Topic       ${result.remote.topicId}  (${hashscanTopicUrl(env.HEDERA_NETWORK, result.remote.topicId)})`);
    console.log(`Posición    ${result.remote.sequenceNumber}`);
    console.log(`Consenso    ${result.remote.consensusTimestamp}  (${hashscanTransactionUrl(env.HEDERA_NETWORK, result.remote.consensusTimestamp)})`);
    console.log(`Hash        ${result.remote.hash ?? "(ilegible)"}`);
  }
  process.exitCode = result.status === "MISMATCH" ? 1 : 0;
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : "desconocido"}`);
  process.exitCode = 1;
});
