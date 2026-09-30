import type { DenialCode } from "@/lib/domain/permissions";

/** Códigos de error del flujo: los del dominio + los que solo detecta la base de datos. */
export type FlowErrorCode =
  | DenialCode
  | "INVALID_INPUT"
  | "INVALID_EVENT"
  | "DUPLICATE_EVENT"
  | "ACTOR_NOT_FOUND"
  | "NOT_FOUND"
  | "UNKNOWN";

const KNOWN_CODES = new Set<string>([
  "FORBIDDEN_ROLE",
  "NOT_SCHOOL_MEMBER",
  "NOT_COMMITMENT_OWNER",
  "INVALID_TRANSITION",
  "NEED_NOT_OPEN",
  "INVALID_QUANTITY",
  "QUANTITY_EXCEEDS_AVAILABLE",
  "INVALID_INPUT",
  "INVALID_EVENT",
  "DUPLICATE_EVENT",
  "ACTOR_NOT_FOUND",
  "NOT_FOUND",
]);

/** Error de negocio con mensaje en español apto para mostrar al usuario. */
export class FlowError extends Error {
  constructor(
    readonly code: FlowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FlowError";
  }
}

/**
 * Traduce un error de las RPC flow_* (mensaje 'CODE: texto', HINT = CODE) a
 * FlowError. Errores sin código conocido se devuelven como UNKNOWN sin
 * exponer detalles internos.
 */
export function flowErrorFromRpc(error: { message: string; hint?: string | null; code?: string }): FlowError {
  const code = error.hint && KNOWN_CODES.has(error.hint) ? (error.hint as FlowErrorCode) : null;
  if (!code) return new FlowError("UNKNOWN", "No se pudo completar la operación. Intenta de nuevo.");
  const text = error.message.startsWith(`${code}: `) ? error.message.slice(code.length + 2) : error.message;
  return new FlowError(code, text);
}
