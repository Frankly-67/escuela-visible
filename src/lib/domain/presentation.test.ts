import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Constants } from "@/types/database";

import { CATEGORY_LABEL, formatQuantity, NEED_KIND_LABEL, NEED_STATUS_LABEL, PRIORITY_LABEL } from "./labels";
import { computeProgress } from "./progress";

describe("etiquetas de interfaz", () => {
  it("cubren exactamente los valores de la base de datos", () => {
    const E = Constants.public.Enums;
    assert.deepEqual(Object.keys(CATEGORY_LABEL).sort(), [...E.need_category].sort());
    assert.deepEqual(Object.keys(PRIORITY_LABEL).sort(), [...E.need_priority].sort());
    assert.deepEqual(Object.keys(NEED_STATUS_LABEL).sort(), [...E.need_status].sort());
    assert.deepEqual(Object.keys(NEED_KIND_LABEL).sort(), [...E.need_kind].sort());
  });

  it("formatea cantidades en español de Colombia", () => {
    assert.equal(formatQuantity(20, "kits"), "20 kits");
    assert.equal(formatQuantity(1.5, "m²"), "1,5 m²");
    assert.equal(formatQuantity(1500, "unidades"), "1.500 unidades");
  });
});

describe("computeProgress", () => {
  it("sin apoyos: 0 %", () => {
    assert.deepEqual(computeProgress(20), { goal: 20, committed: 0, confirmed: 0, committedPercent: 0, confirmedPercent: 0 });
  });

  it("separa comprometido y confirmado", () => {
    const p = computeProgress(20, 15, 5);
    assert.equal(p.committedPercent, 75);
    assert.equal(p.confirmedPercent, 25);
  });

  it("redondea hacia abajo: no muestra 100 % antes de completar", () => {
    assert.equal(computeProgress(3, 2.99, 0).committedPercent, 99);
    assert.equal(computeProgress(20, 20, 20).confirmedPercent, 100);
  });

  it("acota entre 0 y 100 y tolera meta cero", () => {
    assert.equal(computeProgress(10, 15, 0).committedPercent, 100);
    assert.equal(computeProgress(0, 5, 5).committedPercent, 0);
  });
});
