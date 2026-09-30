/**
 * Lecturas del Mirror Node (REST, solo lectura, sin credenciales).
 *
 * Los datos del Mirror Node son externos: se validan con zod antes de usarse.
 * Cada lectura devuelve:
 *  - found        → datos validados
 *  - not_found    → 404 (p. ej. mensaje todavía no indexado)
 *  - unavailable  → red, timeout, 5xx o respuesta con formato inesperado
 */
import { z } from "zod";

export type MirrorResult<T> =
  | { kind: "found"; data: T }
  | { kind: "not_found" }
  | { kind: "unavailable"; reason: string };

export type MirrorOptions = {
  mirrorUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const entityId = z.string().regex(/^\d+\.\d+\.\d+$/);
const consensusTimestamp = z.string().regex(/^\d+\.\d{9}$/);

const topicMessageSchema = z.object({
  topic_id: entityId,
  sequence_number: z.number().int().positive(),
  consensus_timestamp: consensusTimestamp,
  payer_account_id: entityId,
  message: z.string(),
  running_hash: z.string(),
  chunk_info: z.object({ number: z.number().int(), total: z.number().int() }).nullable().optional(),
});

export type MirrorTopicMessage = {
  topicId: string;
  sequenceNumber: number;
  consensusTimestamp: string;
  payerAccountId: string;
  /** Contenido del mensaje en base64, tal como lo devuelve el Mirror Node. */
  messageBase64: string;
  runningHash: string;
  chunkInfo: { number: number; total: number } | null;
};

const topicMessagesPageSchema = z.object({
  messages: z.array(topicMessageSchema),
  links: z.object({ next: z.string().nullable() }).optional(),
});

async function getJson(url: string, opts: MirrorOptions): Promise<MirrorResult<unknown>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "error de red";
    return { kind: "unavailable", reason };
  }
  if (res.status === 404) return { kind: "not_found" };
  if (!res.ok) return { kind: "unavailable", reason: `HTTP ${res.status}` };
  try {
    return { kind: "found", data: await res.json() };
  } catch {
    return { kind: "unavailable", reason: "respuesta no es JSON" };
  }
}

function toTopicMessage(raw: z.infer<typeof topicMessageSchema>): MirrorTopicMessage {
  return {
    topicId: raw.topic_id,
    sequenceNumber: raw.sequence_number,
    consensusTimestamp: raw.consensus_timestamp,
    payerAccountId: raw.payer_account_id,
    messageBase64: raw.message,
    runningHash: raw.running_hash,
    chunkInfo: raw.chunk_info ?? null,
  };
}

const base = (url: string) => url.replace(/\/+$/, "");

/** Mensaje en la posición `sequenceNumber` del topic. */
export async function getTopicMessage(
  opts: MirrorOptions & { topicId: string; sequenceNumber: number },
): Promise<MirrorResult<MirrorTopicMessage>> {
  const result = await getJson(
    `${base(opts.mirrorUrl)}/api/v1/topics/${opts.topicId}/messages/${opts.sequenceNumber}`,
    opts,
  );
  if (result.kind !== "found") return result;
  const parsed = topicMessageSchema.safeParse(result.data);
  return parsed.success
    ? { kind: "found", data: toTopicMessage(parsed.data) }
    : { kind: "unavailable", reason: "mensaje del Mirror Node con formato inesperado" };
}

/**
 * Mensajes del topic con consensus timestamp >= `fromTimestamp`, en orden
 * ascendente, siguiendo la paginación hasta `maxPages`.
 */
export async function listTopicMessages(
  opts: MirrorOptions & { topicId: string; fromTimestamp?: string; maxPages?: number },
): Promise<MirrorResult<MirrorTopicMessage[]>> {
  const params = new URLSearchParams({ order: "asc", limit: "100" });
  if (opts.fromTimestamp) params.set("timestamp", `gte:${opts.fromTimestamp}`);
  let next: string | null = `/api/v1/topics/${opts.topicId}/messages?${params}`;
  const messages: MirrorTopicMessage[] = [];

  for (let page = 0; next && page < (opts.maxPages ?? 10); page++) {
    const result = await getJson(`${base(opts.mirrorUrl)}${next}`, opts);
    if (result.kind === "not_found") return { kind: "found", data: messages };
    if (result.kind !== "found") return result;
    const parsed = topicMessagesPageSchema.safeParse(result.data);
    if (!parsed.success) return { kind: "unavailable", reason: "página del Mirror Node con formato inesperado" };
    messages.push(...parsed.data.messages.map(toTopicMessage));
    next = parsed.data.links?.next ?? null;
  }
  return { kind: "found", data: messages };
}

/** Decodifica el contenido base64 de un mensaje a bytes. Devuelve null si no es base64 válido. */
export function decodeMessageBase64(messageBase64: string): Uint8Array | null {
  try {
    const binary = atob(messageBase64);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
