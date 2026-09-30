export type HederaNetwork = "testnet" | "mainnet" | "previewnet";

const HASHSCAN = "https://hashscan.io";

/** Página pública del topic en HashScan. */
export function hashscanTopicUrl(network: HederaNetwork, topicId: string): string {
  return `${HASHSCAN}/${network}/topic/${topicId}`;
}

/**
 * Página pública de una transacción en HashScan, por su consensus timestamp
 * (formato Hedera `segundos.nanos`).
 */
export function hashscanTransactionUrl(network: HederaNetwork, consensusTimestamp: string): string {
  return `${HASHSCAN}/${network}/transaction/${consensusTimestamp}`;
}

/**
 * Convierte un TransactionId del SDK (`0.0.123@1700000000.000000005`) al
 * formato del Mirror Node (`0.0.123-1700000000-000000005`).
 */
export function toMirrorTransactionId(sdkTransactionId: string): string {
  const match = /^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/.exec(sdkTransactionId);
  if (!match) throw new Error(`TransactionId con formato inesperado: ${sdkTransactionId}`);
  const [, account, seconds, nanos] = match;
  return `${account}-${seconds}-${nanos.padStart(9, "0")}`;
}

/** Segundos del validStart de un TransactionId del SDK. */
export function transactionValidStartSeconds(sdkTransactionId: string): number {
  const match = /@(\d+)\.\d+$/.exec(sdkTransactionId);
  if (!match) throw new Error(`TransactionId con formato inesperado: ${sdkTransactionId}`);
  return Number(match[1]);
}
