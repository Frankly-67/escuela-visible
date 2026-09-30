import "server-only";

import { Client, PrivateKey } from "@hiero-ledger/sdk";

import type { HederaOperatorEnv } from "@/lib/env.server";

export type OperatorKeyType = HederaOperatorEnv["HEDERA_OPERATOR_KEY_TYPE"];

/** Tipo que reporta el SDK (`PrivateKey.type`) para cada tipo declarado. */
const SDK_KEY_TYPE: Record<OperatorKeyType, string> = {
  ecdsa: "secp256k1",
  ed25519: "ED25519",
};

export class OperatorKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatorKeyError";
  }
}

/**
 * Interpreta la clave privada del operador sin usar `PrivateKey.fromString`
 * (deprecado y ambiguo):
 *  - DER (hex con cabecera, p. ej. 3030… para ECDSA): fromStringDer, y se
 *    comprueba que el tipo detectado sea el declarado.
 *  - hex crudo de 64 caracteres (con o sin 0x): se usa el tipo declarado.
 *
 * Los mensajes de error nunca incluyen la clave.
 */
export function parseOperatorKey(
  raw: string,
  declaredType: OperatorKeyType,
): { key: PrivateKey; format: "der" | "hex" } {
  const hex = raw.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new OperatorKeyError("HEDERA_OPERATOR_KEY debe ser hexadecimal (DER o hex crudo).");
  }

  let key: PrivateKey;
  let format: "der" | "hex";
  try {
    if (hex.length === 64) {
      format = "hex";
      key = declaredType === "ecdsa" ? PrivateKey.fromStringECDSA(hex) : PrivateKey.fromStringED25519(hex);
    } else {
      format = "der";
      key = PrivateKey.fromStringDer(hex);
    }
  } catch {
    throw new OperatorKeyError(`HEDERA_OPERATOR_KEY no es una clave ${declaredType} válida.`);
  }

  if (key.type !== SDK_KEY_TYPE[declaredType]) {
    throw new OperatorKeyError(
      `HEDERA_OPERATOR_KEY es de tipo ${key.type}, pero HEDERA_OPERATOR_KEY_TYPE declara ${declaredType}.`,
    );
  }
  return { key, format };
}

/**
 * Cliente de Hedera para la red configurada. Con `withOperator: false` no
 * carga la clave privada (solo lecturas vía Mirror Node).
 * Cerrar con `client.close()` al terminar.
 */
export function createHederaClient(env: HederaOperatorEnv, { withOperator = true } = {}): Client {
  const client = Client.forName(env.HEDERA_NETWORK);
  if (withOperator) {
    const { key } = parseOperatorKey(env.HEDERA_OPERATOR_KEY, env.HEDERA_OPERATOR_KEY_TYPE);
    client.setOperator(env.HEDERA_OPERATOR_ID, key);
  }
  return client;
}
