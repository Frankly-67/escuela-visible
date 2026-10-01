import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Constants } from "@/types/database";

import {
  CATEGORY_LABEL,
  EVENT_LABEL,
  formatConfirmedProgress,
  formatDate,
  formatDateTime,
  formatQuantity,
  NEED_KIND_LABEL,
  NEED_STATUS_LABEL,
  PRIORITY_LABEL,
  ROLE_LABEL,
} from "./labels";
import { computeProgress } from "./progress";

describe("etiquetas de interfaz", () => {
  it("cubren exactamente los valores de la base de datos", () => {
    const E = Constants.public.Enums;
    assert.deepEqual(Object.keys(CATEGORY_LABEL).sort(), [...E.need_category].sort());
    assert.deepEqual(Object.keys(PRIORITY_LABEL).sort(), [...E.need_priority].sort());
    assert.deepEqual(Object.keys(NEED_STATUS_LABEL).sort(), [...E.need_status].sort());
    assert.deepEqual(Object.keys(NEED_KIND_LABEL).sort(), [...E.need_kind].sort());
  });

  it("eventos y roles cubren exactamente los valores de la base de datos", () => {
    const E = Constants.public.Enums;
    assert.deepEqual(Object.keys(EVENT_LABEL).sort(), [...E.hedera_event_type].sort());
    assert.deepEqual(Object.keys(ROLE_LABEL).sort(), [...E.user_role].sort());
  });

  it("los roles son genéricos, sin nombres de personas", () => {
    assert.deepEqual(ROLE_LABEL, { school_rep: "La escuela", admin: "Escuela Visible", supporter: "Un aliado" });
  });

  it("texto exacto del progreso confirmado", () => {
    assert.equal(formatConfirmedProgress(5, 20, "kits", 25), "5 de 20 kits confirmados por la escuela · 25 %");
  });

  it("fechas en hora de Colombia (UTC-5)", () => {
    // 02:31 UTC del 1 de octubre = 21:31 del 30 de septiembre en Bogotá.
    assert.equal(formatDate("2026-10-01T02:31:26.133Z"), "30 de septiembre de 2026");
    assert.match(formatDateTime("2026-10-01T02:31:26.133Z"), /^30 de septiembre de 2026 a las 9:31/);
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
