import { randomUUID } from "node:crypto";

import { canonicalize } from "./canonical";
import { sha256Hex } from "./hash";
import { serializeHcsMessage, utf8ByteLength } from "./message";
import { eventPayloadSchema } from "./schema";
import {
  EVENT_APP_ID,
  EVENT_SCHEMA_VERSION,
  type ActorRole,
  type EventPayloadV1,
  type HederaEventType,
} from "./types";

export type BuildEventInput = {
  type: HederaEventType;
  needId: string;
  schoolId: string;
  commitmentId?: string | null;
  actorRole: ActorRole;
  /** Inyectables para pruebas; por defecto uuid aleatorio y hora actual. */
  eventId?: string;
  now?: Date;
};

export type BuiltEvent = {
  payload: EventPayloadV1;
  /** Texto EXACTO sobre el que se calcula el hash. Se guarda tal cual en hedera_events. */
  payloadCanonical: string;
  /** SHA-256 hex de `payloadCanonical`. */
  payloadHash: string;
  /** Mensaje HCS canónico `{ hash, payload }` listo para enviar. */
  message: string;
  messageBytes: number;
};

export class InvalidEventError extends Error {
  constructor(readonly issues: string[]) {
    super(`Evento inválido: ${issues.join("; ")}`);
    this.name = "InvalidEventError";
  }
}

/**
 * Construye un evento listo para registrar: valida el payload con el esquema
 * estricto, lo serializa de forma canónica, calcula su SHA-256 y arma el
 * mensaje HCS (comprobando que cabe en un chunk).
 */
export function buildEvent(input: BuildEventInput): BuiltEvent {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new InvalidEventError(["timestamp: fecha inválida"]);

  const candidate: EventPayloadV1 = {
    v: EVENT_SCHEMA_VERSION,
    app: EVENT_APP_ID,
    eventId: input.eventId ?? randomUUID(),
    type: input.type,
    needId: input.needId,
    schoolId: input.schoolId,
    commitmentId: input.commitmentId ?? null,
    actorRole: input.actorRole,
    timestamp: now.toISOString(),
  };

  const parsed = eventPayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new InvalidEventError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }

  const payload = parsed.data;
  const payloadCanonical = canonicalize(payload);
  const payloadHash = sha256Hex(payloadCanonical);
  const message = serializeHcsMessage(payload, payloadHash);

  return { payload, payloadCanonical, payloadHash, message, messageBytes: utf8ByteLength(message) };
}
