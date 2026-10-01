import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FlowError } from "@/lib/flow/errors";
import { createNeedInputSchema } from "@/lib/flow/schemas";

import {
  flowErrorMessage,
  GENERIC_ERROR,
  needCreatedState,
  needRejectedState,
  needValidatedState,
  parseNeedForm,
  parseQuantity,
  publicationFromOutcome,
} from "./flow-result";

const OTHER_SCHOOL = "00000000-0000-4000-a000-00000000000b";
const EVENT = "e0000000-0000-4000-8000-000000000001";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};
const VALID = {
  kind: "need",
  title: "Kits escolares (DEMO)",
  description: "Kits para 20 estudiantes",
  category: "materiales",
  priority: "media",
  goalQuantity: "20",
  goalUnit: "kits",
  eventDate: "",
};

describe("parseQuantity", () => {
  it("acepta enteros y decimales con coma o punto", () => {
    assert.equal(parseQuantity("20"), 20);
    assert.equal(parseQuantity(" 1,5 "), 1.5);
    assert.equal(parseQuantity("1.25"), 1.25);
  });
  it("rechaza vacío, texto, signos y separadores de miles", () => {
    for (const v of ["", " ", "veinte", "-3", "1e3", "1.000,5", "2,", ",5", "0x10"]) assert.equal(parseQuantity(v), null, v);
  });
});

describe("parseNeedForm", () => {
  it("convierte el formulario en el input de createNeed, sin schoolId", () => {
    const r = parseNeedForm(form(VALID));
    assert.ok(r.ok);
    assert.deepEqual(r.input, {
      kind: "need",
      title: "Kits escolares (DEMO)",
      description: "Kits para 20 estudiantes",
      category: "materiales",
      priority: "media",
      goalQuantity: 20,
      goalUnit: "kits",
      eventDate: null,
    });
    assert.ok(!("schoolId" in r.input));
  });

  it("ignora schoolId, role, userId y supporterId enviados en el formulario", () => {
    const r = parseNeedForm(form({ ...VALID, schoolId: OTHER_SCHOOL, role: "admin", userId: OTHER_SCHOOL, supporterId: OTHER_SCHOOL }));
    assert.ok(r.ok);
    assert.deepEqual(Object.keys(r.input).sort(), ["category", "description", "eventDate", "goalQuantity", "goalUnit", "kind", "priority", "title"]);
    assert.ok(!JSON.stringify(r.input).includes(OTHER_SCHOOL));
  });

  it("el resultado + la escuela del actor pasa el schema existente (sin reglas nuevas)", () => {
    const r = parseNeedForm(form({ ...VALID, goalQuantity: "1,5", eventDate: "2026-11-20", kind: "campaign" }));
    assert.ok(r.ok);
    const parsed = createNeedInputSchema.safeParse({ ...r.input, schoolId: "00000000-0000-4000-a000-00000000000a" });
    assert.ok(parsed.success);
    assert.equal(parsed.data.goalQuantity, 1.5);
    assert.equal(parsed.data.eventDate, "2026-11-20");
  });

  it("tipo y prioridad vacíos usan los valores por defecto del schema", () => {
    const r = parseNeedForm(form({ ...VALID, kind: "", priority: "" }));
    assert.ok(r.ok);
    const parsed = createNeedInputSchema.parse({ ...r.input, schoolId: "00000000-0000-4000-a000-00000000000a" });
    assert.equal(parsed.kind, "need");
    assert.equal(parsed.priority, "media");
  });

  it("formato inválido → mensaje en español y conserva lo escrito", () => {
    const cases: [Record<string, string>, RegExp][] = [
      [{ ...VALID, category: "" }, /categoría/],
      [{ ...VALID, category: "armas" }, /categoría/],
      [{ ...VALID, kind: "otro" }, /tipo/],
      [{ ...VALID, priority: "urgente" }, /prioridad/],
      [{ ...VALID, goalQuantity: "veinte" }, /meta/],
      [{ ...VALID, goalQuantity: "" }, /meta/],
    ];
    for (const [fields, re] of cases) {
      const r = parseNeedForm(form(fields));
      assert.ok(!r.ok);
      assert.match(r.message, re);
      assert.equal(r.values.title, VALID.title);
    }
  });

  it("título corto o meta 0 pasan el formato y los rechaza el schema existente", () => {
    for (const fields of [{ ...VALID, title: "ab" }, { ...VALID, goalQuantity: "0" }]) {
      const r = parseNeedForm(form(fields));
      assert.ok(r.ok);
      assert.equal(createNeedInputSchema.safeParse({ ...r.input, schoolId: "00000000-0000-4000-a000-00000000000a" }).success, false);
    }
  });
});

describe("flowErrorMessage", () => {
  it("muestra el mensaje de un FlowError de negocio", () => {
    assert.equal(flowErrorMessage(new FlowError("INVALID_TRANSITION", "Esta necesidad no está pendiente de validación.")), "Esta necesidad no está pendiente de validación.");
  });
  it("nunca expone errores internos", () => {
    const internal = [
      new Error("No se pudo leer la necesidad: connection refused at 10.0.0.1"),
      new Error("INVALID_SIGNATURE: operator key 302e0201…"),
      new FlowError("UNKNOWN", "detalle interno"),
      "submission_error: timeout",
      null,
    ];
    for (const e of internal) assert.equal(flowErrorMessage(e), GENERIC_ERROR);
  });
});

describe("publicationFromOutcome", () => {
  it("solo submitted / already_submitted cuentan como publicado", () => {
    assert.equal(publicationFromOutcome({ status: "submitted", sequenceNumber: 6, transactionId: null, consensusTimestamp: null, reconciled: false }), "published");
    assert.equal(publicationFromOutcome({ status: "already_submitted" }), "published");
  });
  it("in_flight, retry_later, failed o excepción → pendiente", () => {
    assert.equal(publicationFromOutcome({ status: "in_flight", detail: "x" }), "pending");
    assert.equal(publicationFromOutcome({ status: "retry_later", detail: "x" }), "pending");
    assert.equal(publicationFromOutcome({ status: "failed", error: "INSUFFICIENT_PAYER_BALANCE" }), "pending");
    assert.equal(publicationFromOutcome(null), "pending");
  });
});

describe("Mensajes de resultado", () => {
  const all = [
    needCreatedState(EVENT, "published"),
    needCreatedState(EVENT, "pending"),
    needValidatedState(EVENT, "published"),
    needValidatedState(EVENT, "pending"),
    needRejectedState(),
  ];

  it("honestos: pendiente si no se publicó; el rechazo no se publica", () => {
    assert.match(all[0].status === "success" ? all[0].message : "", /pendiente de validación.*ya está publicado en Hedera/);
    assert.match(all[1].status === "success" ? all[1].message : "", /quedó pendiente/);
    assert.match(all[3].status === "success" ? all[3].message : "", /quedó pendiente/);
    const rejected = all[4];
    assert.ok(rejected.status === "success" && rejected.eventId === null && rejected.publication === "none");
    assert.match(rejected.message, /no se publica en Hedera/);
  });

  it("nunca dicen «verificado» ni afirman entregas", () => {
    for (const s of all) {
      assert.ok(s.status === "success");
      assert.doesNotMatch(s.message, /verificad|entrega|garantiza|demuestra|prueba/i);
    }
  });

  it("enlazan el evento solo cuando existe", () => {
    assert.deepEqual(all.map((s) => (s.status === "success" ? s.eventId : "x")), [EVENT, EVENT, EVENT, EVENT, null]);
  });
});
