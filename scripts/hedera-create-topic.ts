/**
 * Crea el ÚNICO topic HCS del MVP.
 *
 *   npm run hedera:create-topic               → vista previa: NO envía nada
 *   npm run hedera:create-topic -- --confirm  → envía TopicCreateTransaction
 *
 * Configuración:
 *  - submit key = clave pública del operador: solo Escuela Visible puede publicar.
 *  - sin admin key: el topic es inmutable (nadie puede cambiar la submit key ni borrarlo).
 *  - auto-renovación: cuenta del operador (el SDK la fija al congelar), período 90 días.
 *  - memo público sin datos sensibles.
 *  - tarifa máxima 5 ℏ (tope de seguridad; el costo real es muy inferior).
 *
 * No publica ningún mensaje HCS. Solo guarda HEDERA_TOPIC_ID en .env.local
 * si el receipt es SUCCESS. Nunca imprime la clave privada.
 */
import "./lib/load-env";

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Hbar, Status, TopicCreateTransaction } from "@hiero-ledger/sdk";

import { getHederaOperatorEnv } from "@/lib/env.server";
import { createHederaClient, parseOperatorKey } from "@/lib/hedera/client";

const TOPIC_MEMO = "Escuela Visible MVP - eventos de trazabilidad (testnet)";
const MAX_FEE_HBAR = 5;
const ENV_FILE = path.resolve(import.meta.dirname, "../.env.local");
const confirm = process.argv.includes("--confirm");

type MirrorTopic = {
  topic_id: string;
  memo: string;
  deleted: boolean;
  admin_key: { _type: string; key: string } | null;
  submit_key: { _type: string; key: string } | null;
  auto_renew_account: string | null;
  auto_renew_period: number | null;
};

const mask = (id: string) => id.replace(/^(\d+\.\d+\.\d{3})\d*(\d{3})$/, "$1…$2");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mirrorJson<T>(mirrorUrl: string, route: string): Promise<T | null> {
  const res = await fetch(`${mirrorUrl}${route}`, { headers: { accept: "application/json" } });
  return res.ok ? ((await res.json()) as T) : null;
}

/** Sustituye (o agrega) la línea HEDERA_TOPIC_ID sin tocar el resto del archivo. */
function saveTopicId(topicId: string) {
  const original = readFileSync(ENV_FILE, "utf8");
  const line = `HEDERA_TOPIC_ID=${topicId}`;
  const updated = /^HEDERA_TOPIC_ID=.*$/m.test(original)
    ? original.replace(/^HEDERA_TOPIC_ID=.*$/m, line)
    : `${original.replace(/\s*$/, "")}\n${line}\n`;
  writeFileSync(ENV_FILE, updated, "utf8");
}

async function main() {
  const env = getHederaOperatorEnv();

  // --- Precondiciones (todas locales o de solo lectura) ----------------------
  if (env.HEDERA_NETWORK !== "testnet") {
    throw new Error(`Este script solo crea topics en testnet (HEDERA_NETWORK=${env.HEDERA_NETWORK}).`);
  }
  const existing = process.env.HEDERA_TOPIC_ID ?? "";
  if (/^\d+\.\d+\.\d+$/.test(existing)) {
    throw new Error(`Ya hay un topic configurado (HEDERA_TOPIC_ID=${existing}). El MVP usa un único topic: no se crea otro.`);
  }
  const { key } = parseOperatorKey(env.HEDERA_OPERATOR_KEY, env.HEDERA_OPERATOR_KEY_TYPE);
  const operatorPublicKey = key.publicKey;
  const account = await mirrorJson<{ balance: { balance: number } | null }>(
    env.HEDERA_MIRROR_NODE_URL,
    `/api/v1/accounts/${env.HEDERA_OPERATOR_ID}`,
  );
  const balanceHbar = account?.balance ? account.balance.balance / 1e8 : null;

  console.log("Configuración del topic");
  console.log(`  red                 ${env.HEDERA_NETWORK}`);
  console.log(`  operador / pagador  ${mask(env.HEDERA_OPERATOR_ID)}`);
  console.log(`  submit key          clave pública del operador (${env.HEDERA_OPERATOR_KEY_TYPE.toUpperCase()})`);
  console.log(`  admin key           ninguna → topic inmutable`);
  console.log(`  auto-renovación     cuenta del operador, cada 90 días`);
  console.log(`  memo                "${TOPIC_MEMO}"`);
  console.log(`  tarifa máxima       ${MAX_FEE_HBAR} ℏ`);
  console.log(`  balance actual      ${balanceHbar ?? "desconocido"} ℏ`);
  console.log(`  HEDERA_TOPIC_ID     vacío (se guardará solo si el receipt es SUCCESS)`);

  if (!confirm) {
    console.log("\nVISTA PREVIA: no se envió ninguna transacción. Para crear el topic: npm run hedera:create-topic -- --confirm");
    return;
  }

  // --- Transacción -----------------------------------------------------------
  const client = createHederaClient(env);
  try {
    const transaction = new TopicCreateTransaction()
      .setTopicMemo(TOPIC_MEMO)
      .setSubmitKey(operatorPublicKey)
      .setMaxTransactionFee(new Hbar(MAX_FEE_HBAR));

    console.log("\nEnviando TopicCreateTransaction…");
    const response = await transaction.execute(client);
    const transactionId = response.transactionId.toString();
    // Se imprime antes del receipt: si algo falla después, el topic se puede localizar.
    console.log(`  transaction ID      ${transactionId}`);

    const receipt = await response.getReceipt(client);
    if (receipt.status !== Status.Success || !receipt.topicId) {
      throw new Error(`Receipt con estado ${receipt.status.toString()}: no se guardó nada.`);
    }
    const topicId = receipt.topicId.toString();
    console.log(`  receipt             ${receipt.status.toString()}`);
    console.log(`  TOPIC ID            ${topicId}`);

    saveTopicId(topicId);
    console.log(`  .env.local          HEDERA_TOPIC_ID actualizado`);

    // --- Verificación en el Mirror Node (solo lectura) -------------------------
    let topic: MirrorTopic | null = null;
    for (let i = 0; i < 15 && !topic; i++) {
      await sleep(2000);
      topic = await mirrorJson<MirrorTopic>(env.HEDERA_MIRROR_NODE_URL, `/api/v1/topics/${topicId}`);
    }
    if (!topic) {
      console.log("  Mirror Node         todavía no indexa el topic; verificar luego con el enlace de HashScan.");
    } else {
      const submitOk = topic.submit_key?.key.toLowerCase() === operatorPublicKey.toStringRaw().toLowerCase();
      console.log(`  ${submitOk ? "✓" : "✗"} submit key = operador`);
      console.log(`  ${topic.admin_key === null ? "✓" : "✗"} sin admin key (inmutable)`);
      console.log(`  ${topic.auto_renew_account === env.HEDERA_OPERATOR_ID ? "✓" : "✗"} auto-renovación con el operador`);
      console.log(`  ${topic.memo === TOPIC_MEMO ? "✓" : "✗"} memo`);
      console.log(`  ${!topic.deleted ? "✓" : "✗"} activo`);
    }

    const mirrorTxId = transactionId.replace("@", "-").replace(/\.(?=\d+$)/, "-");
    const tx = await mirrorJson<{ transactions: { charged_tx_fee: number; consensus_timestamp: string }[] }>(
      env.HEDERA_MIRROR_NODE_URL,
      `/api/v1/transactions/${mirrorTxId}`,
    );
    if (tx?.transactions[0]) {
      console.log(`  costo cobrado       ${tx.transactions[0].charged_tx_fee / 1e8} ℏ`);
      console.log(`  consenso            ${tx.transactions[0].consensus_timestamp}`);
    }
    console.log(`  HashScan            https://hashscan.io/testnet/topic/${topicId}`);
    console.log("\nTOPIC CREADO. No se publicó ningún mensaje HCS.");
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(`\nERROR: ${error instanceof Error ? error.message : "desconocido"}`);
  process.exitCode = 1;
});
