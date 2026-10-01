/**
 * Historia pública de una necesidad, a partir de sus eventos y compromisos.
 * Función pura: sin I/O. Solo usa columnas seguras (sin notas, sin ids de
 * personas) y describe a los actores por su ROL.
 *
 * El estado "publicado en Hedera" sale de la base de datos (receipt SUCCESS);
 * la verificación en vivo contra Hedera se hace en /verify/[id].
 */
import type { Enums } from "@/types/database";

import { EVENT_LABEL, formatQuantity, ROLE_LABEL } from "./labels";

export type TimelineEventInput = {
  id: string;
  eventType: Enums<"hedera_event_type">;
  commitmentId: string | null;
  actorRole: Enums<"user_role">;
  sequenceNumber: number | null;
  createdAt: string;
  submissionStatus: Enums<"hedera_submission_status">;
};

export type TimelineCommitmentInput = {
  id: string;
  quantity: number;
  status: Enums<"commitment_status">;
  confirmedAt: string | null;
};

export type TimelineStep = {
  eventId: string;
  eventType: Enums<"hedera_event_type">;
  title: string;
  description: string;
  actor: string;
  /** Momento en que Escuela Visible registró el paso (ISO). */
  recordedAt: string;
  /** Número de registro en el topic de Hedera, si ya se publicó. */
  registryNumber: number | null;
  publishedToHedera: boolean;
};

function describe(event: TimelineEventInput, quantity: string | null): string {
  switch (event.eventType) {
    case "NEED_CREATED":
      return "La escuela registró la necesidad en Escuela Visible.";
    case "NEED_VALIDATED":
      return "Escuela Visible revisó la necesidad y la hizo pública.";
    case "COMMITMENT_CREATED":
      return quantity ? `Un aliado se comprometió a apoyar con ${quantity}.` : "Un aliado se comprometió a apoyar.";
    case "DELIVERY_REPORTED":
      return quantity ? `El aliado informó que realizó la entrega de ${quantity}.` : "El aliado informó que realizó la entrega.";
    case "SCHOOL_CONFIRMED":
      return quantity ? `La escuela confirmó la recepción de ${quantity}.` : "La escuela confirmó la recepción.";
  }
}

export function buildTimeline(
  events: TimelineEventInput[],
  commitments: TimelineCommitmentInput[],
  unit: string,
): TimelineStep[] {
  const quantityById = new Map(commitments.map((c) => [c.id, formatQuantity(c.quantity, unit)]));

  return [...events]
    .sort((a, b) => {
      // Primero por número de registro en Hedera; los no publicados al final, por fecha.
      if (a.sequenceNumber !== null && b.sequenceNumber !== null) return a.sequenceNumber - b.sequenceNumber;
      if (a.sequenceNumber !== null) return -1;
      if (b.sequenceNumber !== null) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    })
    .map((event) => {
      const published = event.submissionStatus === "submitted" && event.sequenceNumber !== null;
      return {
        eventId: event.id,
        eventType: event.eventType,
        title: EVENT_LABEL[event.eventType],
        description: describe(event, event.commitmentId ? quantityById.get(event.commitmentId) ?? null : null),
        actor: ROLE_LABEL[event.actorRole],
        recordedAt: event.createdAt,
        registryNumber: published ? event.sequenceNumber : null,
        publishedToHedera: published,
      };
    });
}

/**
 * Resumen factual de lo registrado. Habla de "publicado en Hedera" (receipt
 * SUCCESS guardado), nunca de "verificado": eso solo lo dice /verify en vivo.
 */
export function summarizeRegistry(steps: TimelineStep[]): string {
  if (steps.length === 0) return "Todavía no hay pasos registrados para esta necesidad.";
  const published = steps.filter((s) => s.publishedToHedera);
  const pasos = steps.length === 1 ? "1 paso" : `${steps.length} pasos`;
  if (published.length === steps.length) {
    const numbers = published.map((s) => s.registryNumber!);
    const range =
      numbers.length === 1 ? `registro n.º ${numbers[0]}` : `registros n.º ${Math.min(...numbers)} a ${Math.max(...numbers)}`;
    return `Escuela Visible registró ${pasos} de esta necesidad y los publicó en Hedera (${range}). Cada paso se puede comprobar con «Ver verificación».`;
  }
  return `Escuela Visible registró ${pasos} de esta necesidad; ${published.length} ya están publicados en Hedera y el resto está pendiente de publicación.`;
}

/** Resumen de lo que la escuela ha confirmado (para el bloque destacado). */
export function summarizeConfirmations(commitments: TimelineCommitmentInput[]) {
  const confirmed = commitments.filter((c) => c.status === "confirmed" && c.confirmedAt);
  if (confirmed.length === 0) return null;
  const total = Math.round(confirmed.reduce((sum, c) => sum + c.quantity * 100, 0)) / 100;
  const lastConfirmedAt = confirmed.map((c) => c.confirmedAt!).sort().at(-1)!;
  return { total, count: confirmed.length, lastConfirmedAt };
}

/** Convierte un consensus timestamp de Hedera ("segundos.nanos") a ISO 8601. */
export function hederaTimestampToIso(consensusTimestamp: string): string {
  const [seconds, nanos = "0"] = consensusTimestamp.split(".");
  const millis = Number(seconds) * 1000 + Math.floor(Number(nanos.padEnd(9, "0")) / 1_000_000);
  return new Date(millis).toISOString();
}
