import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTimeline,
  hederaTimestampToIso,
  summarizeConfirmations,
  summarizeRegistry,
  type TimelineEventInput,
} from "./timeline";

// Forma de los 5 eventos reales del caso DEMO (ids ficticios para la prueba).
const C = "c0000000-0000-4000-8000-000000000001";
const ev = (
  n: number,
  eventType: TimelineEventInput["eventType"],
  actorRole: TimelineEventInput["actorRole"],
  commitmentId: string | null = null,
): TimelineEventInput => ({
  id: `e0000000-0000-4000-8000-00000000000${n}`,
  eventType,
  commitmentId,
  actorRole,
  sequenceNumber: n,
  createdAt: `2026-10-01T02:2${n}:00.000Z`,
  submissionStatus: "submitted",
});
const EVENTS = [
  ev(1, "NEED_CREATED", "school_rep"),
  ev(2, "NEED_VALIDATED", "admin"),
  ev(3, "COMMITMENT_CREATED", "supporter", C),
  ev(4, "DELIVERY_REPORTED", "supporter", C),
  ev(5, "SCHOOL_CONFIRMED", "school_rep", C),
];
const COMMITMENTS = [{ id: C, quantity: 5, status: "confirmed" as const, confirmedAt: "2026-10-01T02:31:26.133Z" }];

describe("buildTimeline", () => {
  it("produce los 5 pasos reales en orden, con títulos aprobados", () => {
    const steps = buildTimeline([...EVENTS].reverse(), COMMITMENTS, "kits");
    assert.deepEqual(
      steps.map((s) => s.title),
      ["Necesidad registrada", "Necesidad validada", "Apoyo comprometido", "Entrega reportada", "Recepción confirmada por la escuela"],
    );
    assert.deepEqual(steps.map((s) => s.registryNumber), [1, 2, 3, 4, 5]);
  });

  it("describe a los actores por ROL, nunca por nombre", () => {
    const steps = buildTimeline(EVENTS, COMMITMENTS, "kits");
    assert.deepEqual(steps.map((s) => s.actor), ["La escuela", "Escuela Visible", "Un aliado", "Un aliado", "La escuela"]);
    const text = JSON.stringify(steps);
    for (const forbidden of ["Aliado DEMO", "Representante", "@", "supporter", "school_rep"]) {
      assert.ok(!text.includes(forbidden), `no debe contener "${forbidden}"`);
    }
  });

  it("incluye la cantidad del compromiso en lenguaje sencillo", () => {
    const steps = buildTimeline(EVENTS, COMMITMENTS, "kits");
    assert.equal(steps[2].description, "Un aliado se comprometió a apoyar con 5 kits.");
    assert.equal(steps[3].description, "El aliado informó que realizó la entrega de 5 kits.");
    assert.equal(steps[4].description, "La escuela confirmó la recepción de 5 kits.");
  });

  it("no inventa cantidades si el compromiso no es visible", () => {
    const steps = buildTimeline(EVENTS, [], "kits");
    assert.equal(steps[4].description, "La escuela confirmó la recepción.");
  });

  it("un evento no publicado no tiene número de registro y va al final", () => {
    const pending = { ...ev(6, "COMMITMENT_CREATED", "supporter", C), sequenceNumber: null, submissionStatus: "pending" as const };
    const steps = buildTimeline([pending, ...EVENTS], COMMITMENTS, "kits");
    const last = steps.at(-1)!;
    assert.equal(last.eventId, pending.id);
    assert.equal(last.publishedToHedera, false);
    assert.equal(last.registryNumber, null);
  });

  it("solo expone los campos de presentación (sin notas ni datos internos)", () => {
    const [step] = buildTimeline(EVENTS, COMMITMENTS, "kits");
    assert.deepEqual(Object.keys(step).sort(), [
      "actor",
      "description",
      "eventId",
      "eventType",
      "publishedToHedera",
      "recordedAt",
      "registryNumber",
      "title",
    ]);
  });
});

describe("summarizeRegistry", () => {
  it("todos publicados: rango de registros, sin decir 'verificado'", () => {
    const text = summarizeRegistry(buildTimeline(EVENTS, COMMITMENTS, "kits"));
    assert.equal(
      text,
      "Escuela Visible registró 5 pasos de esta necesidad y los publicó en Hedera (registros n.º 1 a 5). Cada paso se puede comprobar con «Ver verificación».",
    );
    assert.doesNotMatch(text, /verificad/i);
  });

  it("con pasos pendientes lo dice explícitamente", () => {
    const pending = { ...ev(6, "COMMITMENT_CREATED", "supporter", C), sequenceNumber: null, submissionStatus: "pending" as const };
    assert.equal(
      summarizeRegistry(buildTimeline([...EVENTS, pending], COMMITMENTS, "kits")),
      "Escuela Visible registró 6 pasos de esta necesidad; 5 ya están publicados en Hedera y el resto está pendiente de publicación.",
    );
  });

  it("sin pasos", () => {
    assert.equal(summarizeRegistry([]), "Todavía no hay pasos registrados para esta necesidad.");
  });
});

describe("summarizeConfirmations", () => {
  it("suma lo confirmado y toma la última fecha", () => {
    assert.deepEqual(summarizeConfirmations(COMMITMENTS), { total: 5, count: 1, lastConfirmedAt: "2026-10-01T02:31:26.133Z" });
    const more = [...COMMITMENTS, { id: "x", quantity: 2.5, status: "confirmed" as const, confirmedAt: "2026-10-02T10:00:00.000Z" }];
    assert.deepEqual(summarizeConfirmations(more), { total: 7.5, count: 2, lastConfirmedAt: "2026-10-02T10:00:00.000Z" });
  });

  it("ignora compromisos no confirmados; sin confirmaciones devuelve null", () => {
    assert.equal(summarizeConfirmations([{ id: "a", quantity: 5, status: "delivery_reported", confirmedAt: null }]), null);
    assert.equal(summarizeConfirmations([]), null);
  });
});

describe("hederaTimestampToIso", () => {
  it("convierte segundos.nanos a ISO (milisegundos truncados)", () => {
    assert.equal(hederaTimestampToIso("1790821886.925550104"), "2026-10-01T02:31:26.925Z");
    assert.equal(hederaTimestampToIso("1790821886.000000001"), "2026-10-01T02:31:26.000Z");
  });
});
