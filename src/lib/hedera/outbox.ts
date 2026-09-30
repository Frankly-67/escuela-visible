/**
 * Lógica pura del outbox de eventos (sin red ni base de datos).
 */
import { canonicalize } from "@/lib/events/canonical";
import { sha256Hex } from "@/lib/events/hash";
import { parseHcsMessage, serializeHcsMessage } from "@/lib/events/message";
import { eventPayloadSchema } from "@/lib/events/schema";

import { transactionValidStartSeconds } from "./links";
import { decodeMessageBase64, type MirrorTopicMessage } from "./mirror";

export class OutboxIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxIntegrityError";
  }
}

/**
 * Reconstruye el mensaje HCS a partir de lo GUARDADO en hedera_events (no de
 * una copia en memoria) y se niega a publicar si la fila no es íntegra.
 */
export function rebuildHcsMessage(row: { id: string; payloadCanonical: string; payloadHash: string }): string {
  if (sha256Hex(row.payloadCanonical) !== row.payloadHash) {
    throw new OutboxIntegrityError("sha256(payload_canonical) no coincide con payload_hash");
  }
  let json: unknown;
  try {
    json = JSON.parse(row.payloadCanonical);
  } catch {
    throw new OutboxIntegrityError("payload_canonical no es JSON");
  }
  const parsed = eventPayloadSchema.safeParse(json);
  if (!parsed.success) throw new OutboxIntegrityError("payload_canonical no cumple el esquema de 9 campos");
  if (canonicalize(parsed.data) !== row.payloadCanonical) {
    throw new OutboxIntegrityError("payload_canonical no está en forma canónica");
  }
  if (parsed.data.eventId !== row.id) throw new OutboxIntegrityError("eventId del payload distinto del id de la fila");

  const message = serializeHcsMessage(parsed.data, row.payloadHash);
  // El payload dentro del mensaje es exactamente el texto guardado.
  if (!message.includes(`"payload":${row.payloadCanonical}`)) {
    throw new OutboxIntegrityError("el mensaje reconstruido no contiene el payload guardado");
  }
  return message;
}

/**
 * Una transacción de Hedera solo puede llegar a consenso dentro de su ventana
 * de validez (120 s desde validStart por defecto). Pasado ese margen (+60 s),
 * si no aparece en el topic, es seguro reenviar sin duplicar.
 */
export const RESUBMIT_AFTER_SECONDS = 180;

export function canResubmit(previousTransactionId: string, nowSeconds: number): boolean {
  return nowSeconds - transactionValidStartSeconds(previousTransactionId) > RESUBMIT_AFTER_SECONDS;
}

/**
 * Busca en una lista de mensajes del topic el que corresponde a `eventId`
 * (por CONTENIDO, no por transaction id: el SDK puede reenviar con otro id si
 * la red responde THROTTLED_AT_CONSENSUS). Solo acepta mensajes íntegros.
 */
export function findEventMessage(messages: MirrorTopicMessage[], eventId: string): MirrorTopicMessage | null {
  for (const message of messages) {
    const bytes = decodeMessageBase64(message.messageBase64);
    if (!bytes) continue;
    const parsed = parseHcsMessage(bytes);
    if (parsed.ok && parsed.hashMatches && parsed.message.payload.eventId === eventId) return message;
  }
  return null;
}

/** Timestamp Hedera (`segundos.nanos`) a partir de una fecha ISO, con margen hacia atrás. */
export function toHederaTimestamp(iso: string, marginSeconds = 0): string {
  const seconds = Math.floor(Date.parse(iso) / 1000) - marginSeconds;
  return `${seconds}.000000000`;
}
