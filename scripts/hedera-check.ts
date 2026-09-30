/**
 * Chequeo de credenciales de Hedera SIN transacciones ni firmas:
 *  1. Interpreta HEDERA_OPERATOR_KEY localmente y comprueba el tipo declarado.
 *  2. Compara la clave pública derivada con la clave de la cuenta en el Mirror Node.
 *  3. Consulta el balance con MirrorNodeAccountBalanceQuery (HTTP, sin pago).
 *
 * Nunca imprime la clave privada.
 * Uso: npm run hedera:check
 */
import "./lib/load-env";

import { MirrorNodeAccountBalanceQuery, PrivateKey } from "@hiero-ledger/sdk";
import sdkPackage from "@hiero-ledger/sdk/package.json" with { type: "json" };

import { getHederaOperatorEnv } from "@/lib/env.server";
import { createHederaClient, OperatorKeyError, parseOperatorKey } from "@/lib/hedera/client";

type MirrorAccount = {
  account: string;
  deleted: boolean;
  balance: { balance: number; timestamp: string } | null;
  key: { _type: "ECDSA_SECP256K1" | "ED25519" | "ProtobufEncoded"; key: string } | null;
};

const MIRROR_KEY_TYPE = { ecdsa: "ECDSA_SECP256K1", ed25519: "ED25519" } as const;

const mask = (id: string) => id.replace(/^(\d+\.\d+\.\d{3})\d*(\d{3})$/, "$1…$2");
const line = (ok: boolean | null, label: string, value = "") =>
  console.log(`${ok === null ? "·" : ok ? "✓" : "✗"} ${label.padEnd(34)} ${value}`);

async function main() {
  let failed = false;
  const env = getHederaOperatorEnv();

  line(null, "Red", env.HEDERA_NETWORK);
  line(null, "Operator ID", mask(env.HEDERA_OPERATOR_ID));
  line(null, "SDK", `@hiero-ledger/sdk ${sdkPackage.version}`);

  // 1. Clave local ------------------------------------------------------------
  let key: PrivateKey;
  let format: string;
  try {
    ({ key, format } = parseOperatorKey(env.HEDERA_OPERATOR_KEY, env.HEDERA_OPERATOR_KEY_TYPE));
    line(true, "Clave privada interpretada", `${env.HEDERA_OPERATOR_KEY_TYPE.toUpperCase()} (formato ${format.toUpperCase()}, SDK: ${key.type})`);
  } catch (error) {
    line(false, "Clave privada", error instanceof OperatorKeyError ? error.message : "no se pudo interpretar");
    process.exitCode = 1;
    return;
  }
  const publicKeyRaw = key.publicKey.toStringRaw();

  // 2. Cuenta en el Mirror Node ------------------------------------------------
  const url = `${env.HEDERA_MIRROR_NODE_URL}/api/v1/accounts/${env.HEDERA_OPERATOR_ID}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    line(false, "Cuenta en Mirror Node", `HTTP ${res.status} (¿Account ID o red incorrectos?)`);
    process.exitCode = 1;
    return;
  }
  const account = (await res.json()) as MirrorAccount;
  line(!account.deleted, "Cuenta existe y no está eliminada", account.deleted ? "ELIMINADA" : "sí");
  failed ||= account.deleted;

  const expectedMirrorType = MIRROR_KEY_TYPE[env.HEDERA_OPERATOR_KEY_TYPE];
  const typeMatches = account.key?._type === expectedMirrorType;
  line(typeMatches, "Tipo de clave de la cuenta", account.key?._type ?? "sin clave");
  const keyMatches = typeMatches && account.key?.key.toLowerCase() === publicKeyRaw.toLowerCase();
  line(keyMatches, "Clave pública derivada = cuenta", keyMatches ? "coincide" : "NO coincide");
  failed ||= !keyMatches;

  // 3. Balance -------------------------------------------------------------------
  // AccountBalanceQuery está deprecada en el SDK 2.89 (execute() siempre falla);
  // su reemplazo oficial es MirrorNodeAccountBalanceQuery: HTTP, sin pago ni firma.
  const client = createHederaClient(env, { withOperator: false });
  try {
    const balance = await new MirrorNodeAccountBalanceQuery().setAccountId(env.HEDERA_OPERATOR_ID).execute(client);
    line(true, "Balance (MirrorNodeAccountBalanceQuery)", balance.hbars.toString());
  } catch (error) {
    line(false, "Balance (MirrorNodeAccountBalanceQuery)", error instanceof Error ? error.message : "error");
    failed = true;
  } finally {
    client.close();
  }
  if (account.balance) {
    const hbar = (account.balance.balance / 1e8).toFixed(8).replace(/\.?0+$/, "");
    line(null, "Balance (/accounts, contraste)", `${hbar} ℏ`);
  }

  console.log(failed ? "\nCHEQUEO CON ERRORES" : "\nCREDENCIALES OK — no se firmó ni envió ninguna transacción");
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  // Mensaje genérico: nunca volcar objetos que puedan contener la clave.
  console.error("Error inesperado:", error instanceof Error ? error.message : "desconocido");
  process.exitCode = 1;
});
