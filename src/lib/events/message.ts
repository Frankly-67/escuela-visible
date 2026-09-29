import { canonicalize } from "./canonical";
import { sha256Hex } from "./hash";
import { hcsMessageSchema } from "./schema";
import { MAX_HCS_MESSAGE_BYTES, type EventPayloadV1, type HcsMessageV1 } from "./types";

export class HcsMessageTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(`El mensaje HCS ocupa ${bytes} bytes; el máximo es ${MAX_HCS_MESSAGE_BYTES}`);
    this.name = "HcsMessageTooLargeError";
  }
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/**
 * Serializa el mensaje HCS `{ hash, payload }` en forma canónica y comprueba
 * que cabe en un único chunk. El payload debe venir ya validado.
 */
export function serializeHcsMessage(payload: EventPayloadV1, hash: string): string {
  const message: HcsMessageV1 = { hash, payload };
  const text = canonicalize(message);
  const bytes = utf8ByteLength(text);
  if (bytes > MAX_HCS_MESSAGE_BYTES) throw new HcsMessageTooLargeError(bytes);
  return text;
}

export type ParsedHcsMessage =
  | {
      ok: true;
      message: HcsMessageV1;
      /** Serialización canónica del payload recibido. */
      payloadCanonical: string;
      /** SHA-256 recalculado sobre `payloadCanonical`. */
      recomputedHash: string;
      /** El hash declarado en el mensaje coincide con el recalculado. */
      hashMatches: boolean;
      /** El texto recibido es exactamente la forma canónica del mensaje. */
      isCanonical: boolean;
    }
  | { ok: false; reason: string };

/**
 * Interpreta un mensaje leído de Hedera (texto UTF-8 o bytes crudos).
 * Nunca lanza: devuelve `ok: false` con el motivo, para que la verificación
 * pública pueda explicarlo.
 */
export function parseHcsMessage(raw: string | Uint8Array): ParsedHcsMessage {
  let text: string;
  try {
    text = typeof raw === "string" ? raw : new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return { ok: false, reason: "El mensaje no es texto UTF-8 válido" };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "El mensaje no es JSON válido" };
  }

  const parsed = hcsMessageSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`);
    return { ok: false, reason: `El mensaje no cumple el formato de Escuela Visible: ${issues.join("; ")}` };
  }

  const payloadCanonical = canonicalize(parsed.data.payload);
  const recomputedHash = sha256Hex(payloadCanonical);

  return {
    ok: true,
    message: parsed.data,
    payloadCanonical,
    recomputedHash,
    hashMatches: recomputedHash === parsed.data.hash,
    isCanonical: canonicalize(parsed.data) === text,
  };
}
