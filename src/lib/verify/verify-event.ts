/**
 * Verificación pública de un evento de Escuela Visible contra Hedera.
 *
 * Función PURA (sin I/O): recibe el evento local (fila de hedera_events) y el
 * resultado de la lectura del Mirror Node, y devuelve un estado con las 13
 * comprobaciones.
 *
 * VERIFIED significa: el evento registrado por Escuela Visible coincide byte a
 * byte con el mensaje publicado en el topic de Escuela Visible en Hedera, en la
 * posición indicada, con su marca de consenso y pagado por la cuenta de la
 * plataforma. NO significa que la ayuda haya ocurrido físicamente.
 */
import { canonicalize } from "@/lib/events/canonical";
import { sha256Hex } from "@/lib/events/hash";
import { parseHcsMessage } from "@/lib/events/message";
import { eventPayloadSchema } from "@/lib/events/schema";
import type { ActorRole, HederaEventType } from "@/lib/events/types";
import { decodeMessageBase64, type MirrorResult, type MirrorTopicMessage } from "@/lib/hedera/mirror";
import type { Tables } from "@/types/database";

export type LocalEvent = {
  id: string;
  eventType: HederaEventType;
  needId: string;
  schoolId: string;
  commitmentId: string | null;
  actorRole: ActorRole;
  payloadCanonical: string;
  payloadHash: string;
  submissionStatus: "pending" | "submitted" | "failed";
  topicId: string | null;
  sequenceNumber: number | null;
  consensusTimestamp: string | null;
};

export type VerifyConfig = {
  /** HEDERA_TOPIC_ID: el único topic de Escuela Visible. */
  expectedTopicId: string;
  /** Cuenta operadora que publica (y paga) los mensajes. */
  operatorAccountId: string;
};

export type VerificationStatus =
  | "VERIFIED"
  | "PENDING"
  | "PUBLISH_FAILED"
  | "AWAITING_MIRROR"
  | "UNAVAILABLE"
  | "MISMATCH";

export type MismatchCode =
  | "LOCAL_HASH_INVALID"
  | "LOCAL_PAYLOAD_INCONSISTENT"
  | "TOPIC_MISMATCH"
  | "SEQUENCE_MISMATCH"
  | "PAYER_MISMATCH"
  | "CHUNKED_MESSAGE"
  | "MESSAGE_UNREADABLE"
  | "MESSAGE_NOT_CANONICAL"
  | "MESSAGE_HASH_INVALID"
  | "HASH_MISMATCH"
  | "PAYLOAD_MISMATCH"
  | "EVENT_ID_MISMATCH"
  | "TIMESTAMP_MISMATCH";

export type CheckOutcome = "pass" | "fail" | "skipped";

export type VerificationCheck = {
  /** 1–13, en el orden documentado. */
  step: number;
  code: MismatchCode;
  label: string;
  outcome: CheckOutcome;
  detail?: string;
};

export type VerificationResult = {
  status: VerificationStatus;
  checks: VerificationCheck[];
  mismatches: MismatchCode[];
  /** Datos del mensaje en Hedera cuando se encontró. */
  remote: {
    topicId: string;
    sequenceNumber: number;
    consensusTimestamp: string;
    payerAccountId: string;
    hash: string | null;
  } | null;
  /** Motivo cuando el estado es UNAVAILABLE. */
  unavailableReason?: string;
};

/** Las 13 comprobaciones, en orden. Los textos se muestran en la página pública. */
export const CHECKS: readonly { step: number; code: MismatchCode; label: string }[] = [
  { step: 1, code: "LOCAL_HASH_INVALID", label: "El hash guardado corresponde al contenido guardado del evento" },
  { step: 2, code: "LOCAL_PAYLOAD_INCONSISTENT", label: "El contenido guardado es válido y coincide con el registro del evento" },
  { step: 3, code: "TOPIC_MISMATCH", label: "El mensaje está en el registro (topic) de Escuela Visible" },
  { step: 4, code: "SEQUENCE_MISMATCH", label: "El mensaje está en la posición registrada del topic" },
  { step: 5, code: "PAYER_MISMATCH", label: "El mensaje fue publicado por la cuenta de Escuela Visible" },
  { step: 6, code: "CHUNKED_MESSAGE", label: "El mensaje se publicó completo, en una sola parte" },
  { step: 7, code: "MESSAGE_UNREADABLE", label: "El mensaje publicado tiene el formato de Escuela Visible" },
  { step: 8, code: "MESSAGE_NOT_CANONICAL", label: "El mensaje publicado está en forma canónica" },
  { step: 9, code: "MESSAGE_HASH_INVALID", label: "El hash del mensaje publicado corresponde a su contenido" },
  { step: 10, code: "HASH_MISMATCH", label: "El hash publicado en Hedera es igual al hash guardado" },
  { step: 11, code: "PAYLOAD_MISMATCH", label: "El contenido publicado es idéntico al contenido guardado" },
  { step: 12, code: "EVENT_ID_MISMATCH", label: "El mensaje publicado corresponde a este evento" },
  { step: 13, code: "TIMESTAMP_MISMATCH", label: "La marca de consenso coincide con la registrada" },
];

export function verifyEvent(
  local: LocalEvent,
  mirror: MirrorResult<MirrorTopicMessage> | null,
  config: VerifyConfig,
): VerificationResult {
  const outcomes = new Map<MismatchCode, { outcome: CheckOutcome; detail?: string }>();
  const set = (code: MismatchCode, pass: boolean, detail?: string) =>
    outcomes.set(code, { outcome: pass ? "pass" : "fail", detail: pass ? undefined : detail });

  // --- 1–2. Integridad local (siempre) ---------------------------------------
  set("LOCAL_HASH_INVALID", sha256Hex(local.payloadCanonical) === local.payloadHash, "sha256(payload_canonical) ≠ payload_hash");
  set("LOCAL_PAYLOAD_INCONSISTENT", ...checkLocalPayload(local));

  const build = (status: VerificationStatus, remote: VerificationResult["remote"] = null, unavailableReason?: string) =>
    finalize(status, outcomes, remote, unavailableReason);
  const localBroken = () => [...outcomes.values()].some((o) => o.outcome === "fail");

  // --- Estados previos a la publicación -------------------------------------
  if (local.submissionStatus === "pending") return build(localBroken() ? "MISMATCH" : "PENDING");
  if (local.submissionStatus === "failed") return build(localBroken() ? "MISMATCH" : "PUBLISH_FAILED");

  // submitted: debe tener topic y posición registrados.
  if (local.topicId !== config.expectedTopicId) {
    set("TOPIC_MISMATCH", false, `topic registrado ${local.topicId ?? "(ninguno)"} ≠ topic de Escuela Visible ${config.expectedTopicId}`);
  }
  if (local.sequenceNumber === null) {
    set("SEQUENCE_MISMATCH", false, "el evento figura como publicado pero sin posición (sequence number)");
  }
  // Sin mensaje de Hedera con el que comparar: una alteración local ya es MISMATCH;
  // si no la hay, el estado depende de la lectura del Mirror Node.
  if (mirror === null || mirror.kind !== "found" || local.sequenceNumber === null) {
    if (localBroken()) return build("MISMATCH");
    if (mirror === null) return build("UNAVAILABLE", null, "no se consultó el Mirror Node");
    if (mirror.kind === "unavailable") return build("UNAVAILABLE", null, mirror.reason);
    return build("AWAITING_MIRROR");
  }
  // Con mensaje disponible se compara SIEMPRE, aunque lo local esté alterado:
  // así se puede mostrar que el registro en Hedera sigue intacto.

  // --- 3–13. Comparación con el mensaje de Hedera ---------------------------
  const m = mirror.data;
  set(
    "TOPIC_MISMATCH",
    m.topicId === config.expectedTopicId && m.topicId === local.topicId,
    `topic en Hedera ${m.topicId}; esperado ${config.expectedTopicId}`,
  );
  set("SEQUENCE_MISMATCH", m.sequenceNumber === local.sequenceNumber, `posición en Hedera ${m.sequenceNumber}; registrada ${local.sequenceNumber}`);
  set("PAYER_MISMATCH", m.payerAccountId === config.operatorAccountId, `publicado por ${m.payerAccountId}; esperado ${config.operatorAccountId}`);
  set("CHUNKED_MESSAGE", m.chunkInfo === null || m.chunkInfo.total === 1, `mensaje en ${m.chunkInfo?.total} partes`);

  const bytes = decodeMessageBase64(m.messageBase64);
  const parsed = bytes ? parseHcsMessage(bytes) : ({ ok: false, reason: "base64 inválido" } as const);
  let remoteHash: string | null = null;

  if (!parsed.ok) {
    set("MESSAGE_UNREADABLE", false, parsed.reason);
    for (const code of ["MESSAGE_NOT_CANONICAL", "MESSAGE_HASH_INVALID", "HASH_MISMATCH", "PAYLOAD_MISMATCH", "EVENT_ID_MISMATCH"] as const) {
      outcomes.set(code, { outcome: "skipped", detail: "el mensaje no se pudo interpretar" });
    }
  } else {
    remoteHash = parsed.message.hash;
    set("MESSAGE_UNREADABLE", true);
    set("MESSAGE_NOT_CANONICAL", parsed.isCanonical, "el texto publicado no está en forma canónica");
    set("MESSAGE_HASH_INVALID", parsed.hashMatches, "el hash del mensaje no corresponde a su contenido");
    set("HASH_MISMATCH", parsed.message.hash === local.payloadHash, "el hash publicado es distinto del guardado");
    set("PAYLOAD_MISMATCH", parsed.payloadCanonical === local.payloadCanonical, "el contenido publicado es distinto del guardado");
    set("EVENT_ID_MISMATCH", parsed.message.payload.eventId === local.id, `el mensaje es del evento ${parsed.message.payload.eventId}`);
  }

  set(
    "TIMESTAMP_MISMATCH",
    local.consensusTimestamp === null || local.consensusTimestamp === m.consensusTimestamp,
    `marca en Hedera ${m.consensusTimestamp}; registrada ${local.consensusTimestamp}`,
  );

  const remote = {
    topicId: m.topicId,
    sequenceNumber: m.sequenceNumber,
    consensusTimestamp: m.consensusTimestamp,
    payerAccountId: m.payerAccountId,
    hash: remoteHash,
  };
  return build([...outcomes.values()].some((o) => o.outcome === "fail") ? "MISMATCH" : "VERIFIED", remote);
}

/** Convierte una fila de hedera_events al formato que usa la verificación. */
export function fromEventRow(row: Tables<"hedera_events">): LocalEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    needId: row.need_id,
    schoolId: row.school_id,
    commitmentId: row.commitment_id,
    actorRole: row.actor_role,
    payloadCanonical: row.payload_canonical,
    payloadHash: row.payload_hash,
    submissionStatus: row.submission_status,
    topicId: row.topic_id,
    sequenceNumber: row.sequence_number,
    consensusTimestamp: row.consensus_timestamp,
  };
}

function checkLocalPayload(local: LocalEvent): [boolean, string?] {
  let json: unknown;
  try {
    json = JSON.parse(local.payloadCanonical);
  } catch {
    return [false, "payload_canonical no es JSON"];
  }
  const parsed = eventPayloadSchema.safeParse(json);
  if (!parsed.success) return [false, "payload_canonical no cumple el esquema de 9 campos"];
  if (canonicalize(parsed.data) !== local.payloadCanonical) return [false, "payload_canonical no está en forma canónica"];

  const p = parsed.data;
  const differs =
    p.eventId !== local.id ||
    p.type !== local.eventType ||
    p.needId !== local.needId ||
    p.schoolId !== local.schoolId ||
    p.commitmentId !== local.commitmentId ||
    p.actorRole !== local.actorRole;
  return differs ? [false, "el payload no coincide con los datos del evento"] : [true];
}

function finalize(
  status: VerificationStatus,
  outcomes: Map<MismatchCode, { outcome: CheckOutcome; detail?: string }>,
  remote: VerificationResult["remote"],
  unavailableReason?: string,
): VerificationResult {
  const checks = CHECKS.map((c) => ({ ...c, ...(outcomes.get(c.code) ?? { outcome: "skipped" as const }) }));
  return {
    status,
    checks,
    mismatches: checks.filter((c) => c.outcome === "fail").map((c) => c.code),
    remote,
    ...(unavailableReason ? { unavailableReason } : {}),
  };
}
