import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Constants } from "@/types/database";

import { EVENT_LABEL } from "./labels";
import { statusText, VERIFICATION_MEANING, verifiedSentence } from "./verification-text";

const STATUSES = ["VERIFIED", "PENDING", "PUBLISH_FAILED", "AWAITING_MIRROR", "UNAVAILABLE", "MISMATCH"] as const;
const EVENT_TYPES = Constants.public.Enums.hedera_event_type;

// Afirmaciones que NO hacemos: Hedera no prueba hechos físicos ni "garantiza" la ayuda.
const FORBIDDEN = [
  /demuestra que/i,
  /prueba que/i,
  /garantiza/i,
  /entregad[oa]s? f[ií]sicamente/i,
  /recibi[óo] f[ií]sicamente/i,
  /blockchain prueba/i,
  /Hedera confirma la entrega/i,
  /Hedera demuestra que la ayuda lleg/i,
  /Hedera prueba la recepci/i,
  /entrega verificada por Hedera/i,
  /Hedera verific/i,
];

function allTexts(): string[] {
  const texts: string[] = [];
  for (const type of EVENT_TYPES) {
    texts.push(verifiedSentence(type), EVENT_LABEL[type]);
    for (const status of STATUSES) {
      const t = statusText(status, type);
      texts.push(t.title, t.body);
    }
  }
  return [...texts, ...VERIFICATION_MEANING.means, ...VERIFICATION_MEANING.doesNotMean];
}

describe("textos de verificación", () => {
  it("frase aprobada para la confirmación de la escuela", () => {
    assert.equal(
      verifiedSentence("SCHOOL_CONFIRMED"),
      "La confirmación registrada por Escuela Visible coincide con el registro publicado en Hedera.",
    );
  });

  it("otros pasos: habla del registro guardado que coincide, no de un hecho verificado por Hedera", () => {
    for (const type of EVENT_TYPES.filter((t) => t !== "SCHOOL_CONFIRMED")) {
      assert.equal(
        verifiedSentence(type),
        "El registro de este paso guardado por Escuela Visible coincide con el registro publicado en Hedera.",
      );
    }
  });

  it("incluye la aclaración aprobada sobre la entrega física", () => {
    assert.ok(
      VERIFICATION_MEANING.doesNotMean.includes(
        "Este registro no demuestra por sí solo que la entrega física ocurrió; la recepción la confirma la escuela en Escuela Visible.",
      ),
    );
  });

  it("cubre los 6 estados para los 5 tipos de evento", () => {
    for (const type of EVENT_TYPES) for (const s of STATUSES) assert.ok(statusText(s, type).title.length > 0);
  });

  it("solo VERIFIED tiene tono positivo; UNAVAILABLE no sugiere alteración", () => {
    for (const s of STATUSES) assert.equal(statusText(s, "SCHOOL_CONFIRMED").tone === "ok", s === "VERIFIED", s);
    assert.match(statusText("UNAVAILABLE", "SCHOOL_CONFIRMED").body, /no indica ninguna alteración/);
  });

  it("ningún texto contiene afirmaciones prohibidas", () => {
    // La aclaración aprobada contiene "no demuestra por sí solo": es una NEGACIÓN, se excluye.
    const approvedNegation = VERIFICATION_MEANING.doesNotMean[0];
    for (const text of allTexts().filter((t) => t !== approvedNegation)) {
      for (const pattern of FORBIDDEN) assert.doesNotMatch(text, pattern, text);
    }
  });
});
