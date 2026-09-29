import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Constants } from "@/types/database";

import {
  availableQuantity,
  canTransitionCommitment,
  canTransitionNeed,
  checkCommitmentQuantity,
  needAcceptsCommitments,
  shouldCompleteNeed,
  type CommitmentStatus,
  type NeedStatus,
} from "./state-machine";

const NEED_STATUSES = Constants.public.Enums.need_status;
const COMMITMENT_STATUSES = Constants.public.Enums.commitment_status;

// Única fuente de verdad del test: la especificación aprobada.
const VALID_NEED = new Set(["pending_validation→published", "pending_validation→cancelled", "published→completed"]);
const VALID_COMMITMENT = new Set(["committed→delivery_reported", "delivery_reported→confirmed"]);

describe("máquina de estados de necesidades", () => {
  it("cubre todos los estados de la base de datos", () => {
    assert.deepEqual([...NEED_STATUSES].sort(), ["cancelled", "completed", "pending_validation", "published"]);
  });

  for (const from of NEED_STATUSES) {
    for (const to of NEED_STATUSES) {
      const key = `${from}→${to}`;
      const expected = VALID_NEED.has(key);
      it(`${expected ? "permite" : "rechaza"} ${key}`, () => {
        assert.equal(canTransitionNeed(from as NeedStatus, to as NeedStatus), expected);
      });
    }
  }

  it("no permite saltar la validación (pending_validation → completed)", () => {
    assert.equal(canTransitionNeed("pending_validation", "completed"), false);
  });

  it("completed y cancelled son estados finales", () => {
    for (const to of NEED_STATUSES) {
      assert.equal(canTransitionNeed("completed", to as NeedStatus), false);
      assert.equal(canTransitionNeed("cancelled", to as NeedStatus), false);
    }
  });

  it("solo una necesidad publicada acepta compromisos", () => {
    for (const status of NEED_STATUSES) {
      assert.equal(needAcceptsCommitments(status as NeedStatus), status === "published", status);
    }
  });
});

describe("máquina de estados de compromisos", () => {
  it("cubre todos los estados de la base de datos", () => {
    assert.deepEqual([...COMMITMENT_STATUSES].sort(), ["cancelled", "committed", "confirmed", "delivery_reported"]);
  });

  for (const from of COMMITMENT_STATUSES) {
    for (const to of COMMITMENT_STATUSES) {
      const key = `${from}→${to}`;
      const expected = VALID_COMMITMENT.has(key);
      it(`${expected ? "permite" : "rechaza"} ${key}`, () => {
        assert.equal(canTransitionCommitment(from as CommitmentStatus, to as CommitmentStatus), expected);
      });
    }
  }

  it("no permite saltar directamente a confirmed (committed → confirmed)", () => {
    assert.equal(canTransitionCommitment("committed", "confirmed"), false);
  });

  it("no permite retroceder (confirmed → delivery_reported, delivery_reported → committed)", () => {
    assert.equal(canTransitionCommitment("confirmed", "delivery_reported"), false);
    assert.equal(canTransitionCommitment("delivery_reported", "committed"), false);
  });

  it("cancelled no tiene transiciones en Phase 2", () => {
    for (const s of COMMITMENT_STATUSES) {
      assert.equal(canTransitionCommitment(s as CommitmentStatus, "cancelled"), false);
      assert.equal(canTransitionCommitment("cancelled", s as CommitmentStatus), false);
    }
  });
});

describe("cantidades", () => {
  it("calcula lo disponible sin errores de coma flotante", () => {
    assert.equal(availableQuantity(10, 3), 7);
    assert.equal(availableQuantity(0.3, 0.1), 0.2); // 0.3 - 0.1 = 0.19999999999999998 en float
    assert.equal(availableQuantity(5, 8), 0); // nunca negativa
  });

  it("acepta una cantidad positiva dentro de lo disponible (incluido el total exacto)", () => {
    assert.deepEqual(checkCommitmentQuantity(3, 10, 0), { ok: true });
    assert.deepEqual(checkCommitmentQuantity(7, 10, 3), { ok: true });
    assert.deepEqual(checkCommitmentQuantity(0.2, 0.3, 0.1), { ok: true });
    assert.deepEqual(checkCommitmentQuantity(1.25, 2, 0), { ok: true });
  });

  it("rechaza cantidades inválidas", () => {
    for (const q of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.234]) {
      const r = checkCommitmentQuantity(q, 10, 0);
      assert.equal(r.ok, false, String(q));
      assert.equal(!r.ok && r.code, "INVALID_QUANTITY", String(q));
    }
  });

  it("rechaza superar lo disponible", () => {
    const r = checkCommitmentQuantity(8, 10, 3);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.code, "QUANTITY_EXCEEDS_AVAILABLE");
    assert.equal(!r.ok && r.available, 7);
  });

  it("rechaza cualquier cantidad cuando ya no queda disponible", () => {
    const r = checkCommitmentQuantity(1, 10, 10);
    assert.equal(!r.ok && r.code, "QUANTITY_EXCEEDS_AVAILABLE");
  });

  it("completa la necesidad solo cuando lo CONFIRMADO alcanza la meta", () => {
    assert.equal(shouldCompleteNeed(10, 9.99), false);
    assert.equal(shouldCompleteNeed(10, 10), true);
    assert.equal(shouldCompleteNeed(0.3, 0.1 + 0.2), true); // 0.30000000000000004
  });
});
