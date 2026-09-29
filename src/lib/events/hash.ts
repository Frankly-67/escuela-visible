import { createHash } from "node:crypto";

/** SHA-256 de un texto codificado en UTF-8, en hexadecimal minúscula (64 caracteres). */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
