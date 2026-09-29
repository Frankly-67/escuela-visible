import type { Enums } from "@/types/database";

export type HederaEventType = Enums<"hedera_event_type">;

export const EVENT_SCHEMA_VERSION = 1 as const;
export const EVENT_APP_ID = "escuela-visible" as const;

/**
 * Payload canónico e inmutable de un evento de trazabilidad.
 *
 * Contiene SOLO lo necesario para demostrar un cambio de estado:
 * identificadores, tipo, rol del actor y marca de tiempo.
 * Nunca texto libre, nombres ni datos personales.
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
  actorRole: Enums<"user_role">;
  timestamp: string; // ISO 8601 UTC
};

/**
 * Mensaje publicado en el topic HCS: el payload y su SHA-256 (hex) calculado
 * sobre la serialización canónica del payload.
 */
export type HcsMessageV1 = {
  payload: EventPayloadV1;
  hash: string;
};
