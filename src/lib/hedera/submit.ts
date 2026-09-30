import "server-only";

import { Hbar, TopicMessageSubmitTransaction, type Client } from "@hiero-ledger/sdk";

import { MAX_HCS_MESSAGE_BYTES } from "@/lib/events/types";
import { utf8ByteLength } from "@/lib/events/message";

/** Tope de seguridad por mensaje (el costo real es del orden de milésimas de ℏ). */
const MAX_FEE_HBAR = 2;

/**
 * Prepara (congela) el envío de un mensaje al topic. Congelar fija el
 * transactionId ANTES de enviar, para poder registrarlo y reintentar sin
 * duplicar. Nunca se fragmenta: si no cabe en un chunk, falla.
 */
export function prepareTopicMessage(client: Client, topicId: string, message: string) {
  const bytes = utf8ByteLength(message);
  if (bytes > MAX_HCS_MESSAGE_BYTES) {
    throw new Error(`El mensaje ocupa ${bytes} bytes; máximo ${MAX_HCS_MESSAGE_BYTES}`);
  }
  const transaction = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message)
    .setMaxChunks(1)
    .setMaxTransactionFee(new Hbar(MAX_FEE_HBAR))
    .freezeWith(client);

  const transactionId = transaction.transactionId;
  if (!transactionId) throw new Error("La transacción congelada no tiene transactionId");
  return { transaction, transactionId: transactionId.toString() };
}

/**
 * Envía la transacción y espera el receipt (consulta gratuita).
 * `getReceipt` lanza ReceiptStatusError si el estado no es SUCCESS.
 * Devuelve el transactionId FINAL: si la red respondió THROTTLED_AT_CONSENSUS,
 * el SDK reenvía con otro id.
 */
export async function executeTopicMessage(client: Client, transaction: TopicMessageSubmitTransaction) {
  const response = await transaction.execute(client);
  const receipt = await response.getReceipt(client);
  if (!receipt.topicSequenceNumber) throw new Error("El receipt no incluye sequence number");
  return {
    transactionId: response.transactionId.toString(),
    sequenceNumber: receipt.topicSequenceNumber.toNumber(),
    status: receipt.status.toString(),
  };
}
