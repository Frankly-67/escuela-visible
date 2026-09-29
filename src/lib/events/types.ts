import type { Enums } from "@/types/database";

export type HederaEventType = Enums<"hedera_event_type">;
export type ActorRole = Enums<"user_role">;

export const EVENT_SCHEMA_VERSION = 1 as const;
export const EVENT_APP_ID = "escuela-visible" as const;

/**
 * Tamaño máximo del mensaje HCS: un único chunk del SDK (1024 bytes).
 * Así cada evento es exactamente un mensaje con un único sequence number.
 */
export const MAX_HCS_MESSAGE_BYTES = 1024;

/**
 * Payload canónico e inmutable de un evento de trazabilidad.
 *
 * Contiene SOLO lo necesario para demostrar un cambio de estado:
 * identificadores, tipo, rol del actor y marca de tiempo.
 * Nunca títulos, notas, nombres, fotografías ni datos personales,
 * y tampoco el id del usuario que actuó (solo su rol).
 *
 * Hedera verifica este evento, no la fila completa de Supabase.
 */
export type EventPayloadV1 = {
  v: typeof EVENT_SCHEMA_VERSION;
  app: typeof EVENT_APP_ID;
  eventId: string;
  type: HederaEventType;
  needId: string;
  schoolId: string;
  commitmentId: string | null;
  actorRole: ActorRole;
  timestamp: string; // ISO 8601 UTC con milisegundos: 2026-10-01T15:00:00.000Z
};

/**
 * Mensaje publicado en el topic HCS: el payload y su SHA-256 (hex) calculado
 * sobre la serialización canónica del payload. El mensaje completo también
 * se serializa de forma canónica.
 */
export type HcsMessageV1 = {
  payload: EventPayloadV1;
  hash: string;
};

/** Eventos de la necesidad (sin compromiso asociado). */
export const NEED_EVENT_TYPES = ["NEED_CREATED", "NEED_VALIDATED"] as const satisfies readonly HederaEventType[];

/** Eventos de un compromiso concreto (commitmentId obligatorio). */
export const COMMITMENT_EVENT_TYPES = [
  "COMMITMENT_CREATED",
  "DELIVERY_REPORTED",
  "SCHOOL_CONFIRMED",
] as const satisfies readonly HederaEventType[];

/** Único rol que puede originar cada tipo de evento. */
export const EVENT_ACTOR_ROLE = {
  NEED_CREATED: "school_rep",
  NEED_VALIDATED: "admin",
  COMMITMENT_CREATED: "supporter",
  DELIVERY_REPORTED: "supporter",
  SCHOOL_CONFIRMED: "school_rep",
} as const satisfies Record<HederaEventType, ActorRole>;
