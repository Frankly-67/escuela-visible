import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { flowErrorFromRpc, FlowError } from "./errors";
import {
  confirmReceiptInputSchema,
  createCommitmentInputSchema,
  createNeedInputSchema,
  reportDeliveryInputSchema,
} from "./schemas";

const base = {
  schoolId: "00000000-0000-4000-a000-00000000000a",
  title: "Kits de materiales escolares (DEMO)",
  category: "materiales",
  goalQuantity: 20,
  goalUnit: "kits",
};

describe("createNeedInputSchema", () => {
  it("acepta una necesidad válida y aplica valores por defecto", () => {
    const r = createNeedInputSchema.parse(base);
    assert.equal(r.kind, "need");
    assert.equal(r.priority, "media");
    assert.equal(r.description, "");
    assert.equal(r.eventDate, null);
  });

  it("recorta espacios del texto", () => {
    assert.equal(createNeedInputSchema.parse({ ...base, title: "  Kits (DEMO)  " }).title, "Kits (DEMO)");
  });

  it("rechaza datos inválidos", () => {
    const bad: Record<string, unknown>[] = [
      { title: "ab" },
      { title: "x".repeat(121) },
      { category: "mobiliario" }, // categoría eliminada
      { goalQuantity: 0 },
      { goalQuantity: 1.234 },
      { goalUnit: "" },
      { schoolId: "00000000-0000-4000-A000-00000000000A" }, // mayúsculas
      { extra: "no permitido" },
    ];
    for (const override of bad) {
      assert.equal(createNeedInputSchema.safeParse({ ...base, ...override }).success, false, JSON.stringify(override));
    }
  });

  it("event_date es opcional tanto en necesidades como en campañas (sin reglas adicionales)", () => {
    for (const kind of ["need", "campaign"] as const) {
      for (const eventDate of [null, "2026-11-15"]) {
        assert.equal(createNeedInputSchema.safeParse({ ...base, kind, eventDate }).success, true, `${kind} / ${eventDate}`);
      }
    }
  });
});

describe("esquemas de compromiso y entrega", () => {
  const NEED = "769e4e92-4d46-4421-9d7b-c998f125a480";
  const COMMITMENT = "33333333-3333-4333-8333-333333333333";

  it("compromiso válido: notas en null por defecto", () => {
    const r = createCommitmentInputSchema.parse({ needId: NEED, quantity: 5 });
    assert.deepEqual(r, { needId: NEED, quantity: 5, note: null });
    assert.equal(createCommitmentInputSchema.parse({ needId: NEED, quantity: 1.25 }).quantity, 1.25);
  });

  it("compromiso: rechaza cantidades inválidas, ids inválidos y campos extra", () => {
    for (const bad of [
      { needId: NEED, quantity: 0 },
      { needId: NEED, quantity: -1 },
      { needId: NEED, quantity: 1.005 }, // 3 decimales
      { needId: NEED, quantity: "5" },
      { needId: "no-uuid", quantity: 5 },
      { needId: NEED, quantity: 5, note: "x".repeat(501) }, // límite de la base de datos
      { needId: NEED, quantity: 5, supporterId: COMMITMENT }, // el actor nunca viene del cliente
    ]) {
      assert.equal(createCommitmentInputSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 80));
    }
  });

  it("entrega: nota opcional (null por defecto) con el límite de la base de datos", () => {
    assert.deepEqual(reportDeliveryInputSchema.parse({ commitmentId: COMMITMENT }), { commitmentId: COMMITMENT, deliveryNote: null });
    assert.equal(reportDeliveryInputSchema.safeParse({ commitmentId: COMMITMENT, deliveryNote: "x".repeat(1000) }).success, true);
    assert.equal(reportDeliveryInputSchema.safeParse({ commitmentId: COMMITMENT, deliveryNote: "x".repeat(1001) }).success, false);
  });

  it("confirmación: solo el id del compromiso", () => {
    assert.equal(confirmReceiptInputSchema.safeParse({ commitmentId: COMMITMENT }).success, true);
    assert.equal(confirmReceiptInputSchema.safeParse({ commitmentId: COMMITMENT, confirmedBy: "x" }).success, false);
    assert.equal(confirmReceiptInputSchema.safeParse({ commitmentId: "no-uuid" }).success, false);
  });
});

describe("flowErrorFromRpc", () => {
  it("traduce el código (HINT) y limpia el prefijo del mensaje", () => {
    const e = flowErrorFromRpc({ message: "NOT_SCHOOL_MEMBER: Solo puedes crear necesidades para tu propia escuela.", hint: "NOT_SCHOOL_MEMBER" });
    assert.ok(e instanceof FlowError);
    assert.equal(e.code, "NOT_SCHOOL_MEMBER");
    assert.equal(e.message, "Solo puedes crear necesidades para tu propia escuela.");
  });

  it("no expone errores desconocidos", () => {
    const e = flowErrorFromRpc({ message: 'relation "x" does not exist', hint: null, code: "42P01" });
    assert.equal(e.code, "UNKNOWN");
    assert.doesNotMatch(e.message, /relation/);
  });
});
