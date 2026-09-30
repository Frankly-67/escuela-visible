import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { flowErrorFromRpc, FlowError } from "./errors";
import { createNeedInputSchema } from "./schemas";

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
