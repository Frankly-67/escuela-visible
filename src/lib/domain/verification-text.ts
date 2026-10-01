/**
 * Textos públicos de la verificación. Solo afirmaciones compatibles con lo
 * que realmente se comprueba: que el registro guardado por Escuela Visible
 * coincide con el publicado en Hedera. Nunca que Hedera pruebe la entrega
 * física. Ver verification-text.test.ts (frases prohibidas).
 */
import type { Enums } from "@/types/database";

import type { VerificationStatus } from "@/lib/verify/verify-event";

export type StatusText = { title: string; body: string; tone: "ok" | "neutral" | "warning" | "error" };

/** Resultado principal cuando todo coincide, según el tipo de paso. */
export function verifiedSentence(eventType: Enums<"hedera_event_type">): string {
  return eventType === "SCHOOL_CONFIRMED"
    ? "La confirmación registrada por Escuela Visible coincide con el registro publicado en Hedera."
    : "El registro de este paso guardado por Escuela Visible coincide con el registro publicado en Hedera.";
}

export function statusText(status: VerificationStatus, eventType: Enums<"hedera_event_type">): StatusText {
  switch (status) {
    case "VERIFIED":
      return { title: "Coincide con el registro publicado en Hedera", body: verifiedSentence(eventType), tone: "ok" };
    case "PENDING":
      return {
        title: "Aún no publicado en Hedera",
        body: "Escuela Visible registró este paso, pero todavía no lo ha publicado en Hedera.",
        tone: "neutral",
      };
    case "PUBLISH_FAILED":
      return {
        title: "La publicación en Hedera no se completó",
        body: "Escuela Visible registró este paso, pero su publicación en Hedera falló y debe reintentarse.",
        tone: "warning",
      };
    case "AWAITING_MIRROR":
      return {
        title: "Publicado; Hedera aún lo está indexando",
        body: "El registro fue enviado a Hedera y todavía no aparece en la consulta pública. Vuelve a intentarlo en unos segundos.",
        tone: "neutral",
      };
    case "UNAVAILABLE":
      return {
        title: "No se pudo consultar Hedera en este momento",
        body: "No fue posible completar la comprobación ahora. Esto no indica ninguna alteración del registro.",
        tone: "neutral",
      };
    case "MISMATCH":
      return {
        title: "El registro no coincide con Hedera",
        body: "El registro guardado por Escuela Visible no coincide con el publicado en Hedera. Abajo se indica qué comprobación falló.",
        tone: "error",
      };
  }
}

/** Qué significa y qué no significa la verificación (texto aprobado). */
export const VERIFICATION_MEANING = {
  means: [
    "Escuela Visible publicó este registro en Hedera, desde su propia cuenta, en la fecha indicada.",
    "Lo publicado en Hedera no se puede modificar; por eso la comparación permite detectar si el registro guardado por Escuela Visible cambió.",
  ],
  doesNotMean: [
    "Este registro no demuestra por sí solo que la entrega física ocurrió; la recepción la confirma la escuela en Escuela Visible.",
    "La fecha de Hedera indica cuándo se publicó el registro, no cuándo ocurrió la entrega.",
  ],
} as const;
