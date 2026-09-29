import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Constants } from "@/types/database";

import { EVENT_ACTOR_ROLE } from "@/lib/events/types";

import {
  ACTION_EVENT,
  authorizeConfirmReceipt,
  authorizeCreateCommitment,
  authorizeCreateNeed,
  authorizeRejectNeed,
  authorizeReportDelivery,
  authorizeValidateNeed,
  isSchoolRepOf,
  ownsCommitment,
  type Actor,
  type Decision,
  type DenialCode,
} from "./permissions";
import type { CommitmentStatus, NeedStatus } from "./state-machine";

// Escuelas DEMO (ids del seed).
const EL_MIRADOR = "00000000-0000-4000-a000-00000000000a";
const LA_CASCADA = "00000000-0000-4000-a000-00000000000b";

const admin: Actor = { id: "a0000000-0000-4000-8000-000000000001", role: "admin", schoolId: null };
const repMirador: Actor = { id: "a0000000-0000-4000-8000-000000000002", role: "school_rep", schoolId: EL_MIRADOR };
const repCascada: Actor = { id: "a0000000-0000-4000-8000-000000000003", role: "school_rep", schoolId: LA_CASCADA };
const supporter: Actor = { id: "a0000000-0000-4000-8000-000000000004", role: "supporter", schoolId: null };
const otherSupporter: Actor = { id: "a0000000-0000-4000-8000-000000000005", role: "supporter", schoolId: null };
const ALL_ACTORS = { admin, repMirador, repCascada, supporter, otherSupporter };

const NEED_STATUSES = Constants.public.Enums.need_status as readonly NeedStatus[];
const COMMITMENT_STATUSES = Constants.public.Enums.commitment_status as readonly CommitmentStatus[];

const publishedNeed = { schoolId: EL_MIRADOR, status: "published" as NeedStatus, goalQuantity: 10, committedQuantity: 0 };
const ownCommitment = { supporterId: supporter.id, status: "committed" as CommitmentStatus };
const reportedCommitment = { supporterId: supporter.id, status: "delivery_reported" as CommitmentStatus };

function denied(decision: Decision, code: DenialCode) {
  assert.equal(decision.ok, false, "debería estar denegado");
  assert.equal(!decision.ok && decision.code, code);
  assert.ok(!decision.ok && decision.message.length > 0, "debe explicar el motivo");
}

describe("comprobaciones básicas", () => {
  it("isSchoolRepOf exige rol school_rep Y la misma escuela", () => {
    assert.equal(isSchoolRepOf(repMirador, EL_MIRADOR), true);
    assert.equal(isSchoolRepOf(repMirador, LA_CASCADA), false);
    assert.equal(isSchoolRepOf(admin, EL_MIRADOR), false);
    // Un supporter con schoolId (dato inconsistente) no es representante.
    assert.equal(isSchoolRepOf({ ...supporter, schoolId: EL_MIRADOR }, EL_MIRADOR), false);
    // Un school_rep sin escuela no representa a ninguna.
    assert.equal(isSchoolRepOf({ ...repMirador, schoolId: null }, EL_MIRADOR), false);
  });

  it("ownsCommitment exige rol supporter Y ser quien lo creó", () => {
    assert.equal(ownsCommitment(supporter, ownCommitment), true);
    assert.equal(ownsCommitment(otherSupporter, ownCommitment), false);
    // Aunque el id coincida, otro rol no es dueño.
    assert.equal(ownsCommitment({ ...supporter, role: "admin" }, ownCommitment), false);
  });
});

describe("coherencia con los eventos HCS", () => {
  it("cada acción autoriza exactamente el rol que el evento exige", () => {
    const allowedRole = {
      create_need: authorizeCreateNeed(repMirador, { schoolId: EL_MIRADOR }).ok && "school_rep",
      validate_need: authorizeValidateNeed(admin, { schoolId: EL_MIRADOR, status: "pending_validation" }).ok && "admin",
      create_commitment: authorizeCreateCommitment(supporter, publishedNeed, 1).ok && "supporter",
      report_delivery: authorizeReportDelivery(supporter, publishedNeed, ownCommitment).ok && "supporter",
      confirm_receipt: authorizeConfirmReceipt(repMirador, publishedNeed, reportedCommitment).ok && "school_rep",
    };
    for (const [action, role] of Object.entries(allowedRole)) {
      const event = ACTION_EVENT[action as keyof typeof allowedRole];
      assert.equal(role, EVENT_ACTOR_ROLE[event], `${action} → ${event}`);
    }
  });

  it("rechazar una necesidad no genera evento HCS", () => {
    assert.equal(ACTION_EVENT.reject_need, null);
  });
});

describe("NEED_CREATED — solo el school_rep de esa escuela", () => {
  it("permite al representante crear en su escuela", () => {
    assert.deepEqual(authorizeCreateNeed(repMirador, { schoolId: EL_MIRADOR }), { ok: true });
  });
  it("admin intentando crear una necesidad", () => {
    denied(authorizeCreateNeed(admin, { schoolId: EL_MIRADOR }), "FORBIDDEN_ROLE");
  });
  it("supporter intentando crear una necesidad", () => {
    denied(authorizeCreateNeed(supporter, { schoolId: EL_MIRADOR }), "FORBIDDEN_ROLE");
  });
  it("representante de otra escuela", () => {
    denied(authorizeCreateNeed(repCascada, { schoolId: EL_MIRADOR }), "NOT_SCHOOL_MEMBER");
  });
});

describe("NEED_VALIDATED y rechazo — solo admin, solo desde pending_validation", () => {
  const pending = { schoolId: EL_MIRADOR, status: "pending_validation" as NeedStatus };

  it("permite al admin validar y rechazar una necesidad pendiente", () => {
    assert.deepEqual(authorizeValidateNeed(admin, pending), { ok: true });
    assert.deepEqual(authorizeRejectNeed(admin, pending), { ok: true });
  });
  it("school_rep intentando validar (incluso su propia necesidad)", () => {
    denied(authorizeValidateNeed(repMirador, pending), "FORBIDDEN_ROLE");
    denied(authorizeRejectNeed(repMirador, pending), "FORBIDDEN_ROLE");
  });
  it("supporter intentando validar", () => {
    denied(authorizeValidateNeed(supporter, pending), "FORBIDDEN_ROLE");
  });
  for (const status of NEED_STATUSES.filter((s) => s !== "pending_validation")) {
    it(`admin no puede validar ni rechazar una necesidad ${status}`, () => {
      denied(authorizeValidateNeed(admin, { schoolId: EL_MIRADOR, status }), "INVALID_TRANSITION");
      denied(authorizeRejectNeed(admin, { schoolId: EL_MIRADOR, status }), "INVALID_TRANSITION");
    });
  }
});

describe("COMMITMENT_CREATED — solo supporter, necesidad publicada, cantidad disponible", () => {
  it("permite a un supporter comprometerse con una necesidad publicada", () => {
    assert.deepEqual(authorizeCreateCommitment(supporter, publishedNeed, 3), { ok: true });
  });
  for (const actor of [admin, repMirador, repCascada]) {
    it(`${actor.role}${actor.schoolId === LA_CASCADA ? " (otra escuela)" : ""} no puede comprometerse`, () => {
      denied(authorizeCreateCommitment(actor, publishedNeed, 1), "FORBIDDEN_ROLE");
    });
  }
  it("compromiso sobre una necesidad no publicada (pendiente de validación)", () => {
    denied(authorizeCreateCommitment(supporter, { ...publishedNeed, status: "pending_validation" }, 1), "NEED_NOT_OPEN");
  });
  it("necesidad completada que recibe un nuevo compromiso", () => {
    denied(authorizeCreateCommitment(supporter, { ...publishedNeed, status: "completed" }, 1), "NEED_NOT_OPEN");
  });
  it("necesidad cancelada que recibe un nuevo compromiso", () => {
    denied(authorizeCreateCommitment(supporter, { ...publishedNeed, status: "cancelled" }, 1), "NEED_NOT_OPEN");
  });
  it("cantidad que supera lo todavía disponible", () => {
    denied(authorizeCreateCommitment(supporter, { ...publishedNeed, committedQuantity: 8 }, 3), "QUANTITY_EXCEEDS_AVAILABLE");
  });
  it("cantidad cero o negativa", () => {
    denied(authorizeCreateCommitment(supporter, publishedNeed, 0), "INVALID_QUANTITY");
    denied(authorizeCreateCommitment(supporter, publishedNeed, -2), "INVALID_QUANTITY");
  });
});

describe("DELIVERY_REPORTED — solo el mismo supporter del compromiso", () => {
  it("permite al supporter reportar la entrega de su compromiso", () => {
    assert.deepEqual(authorizeReportDelivery(supporter, publishedNeed, ownCommitment), { ok: true });
  });
  it("supporter intentando reportar la entrega de otro supporter", () => {
    denied(authorizeReportDelivery(otherSupporter, publishedNeed, ownCommitment), "NOT_COMMITMENT_OWNER");
  });
  for (const actor of [admin, repMirador]) {
    it(`${actor.role} no puede reportar entregas`, () => {
      denied(authorizeReportDelivery(actor, publishedNeed, ownCommitment), "FORBIDDEN_ROLE");
    });
  }
  for (const status of COMMITMENT_STATUSES.filter((s) => s !== "committed")) {
    it(`no puede reportar dos veces ni desde ${status}`, () => {
      denied(authorizeReportDelivery(supporter, publishedNeed, { ...ownCommitment, status }), "INVALID_TRANSITION");
    });
  }
  for (const status of NEED_STATUSES.filter((s) => s !== "published")) {
    it(`no puede reportar si la necesidad está ${status}`, () => {
      denied(authorizeReportDelivery(supporter, { ...publishedNeed, status }, ownCommitment), "NEED_NOT_OPEN");
    });
  }
});

describe("SCHOOL_CONFIRMED — solo el school_rep de la escuela de la necesidad", () => {
  it("permite al representante de la escuela confirmar una entrega reportada", () => {
    assert.deepEqual(authorizeConfirmReceipt(repMirador, publishedNeed, reportedCommitment), { ok: true });
  });
  it("supporter intentando confirmar (incluso su propio compromiso)", () => {
    denied(authorizeConfirmReceipt(supporter, publishedNeed, reportedCommitment), "FORBIDDEN_ROLE");
  });
  it("admin intentando confirmar", () => {
    denied(authorizeConfirmReceipt(admin, publishedNeed, reportedCommitment), "FORBIDDEN_ROLE");
  });
  it("school_rep de otra escuela intentando confirmar", () => {
    denied(authorizeConfirmReceipt(repCascada, publishedNeed, reportedCommitment), "NOT_SCHOOL_MEMBER");
  });
  it("no puede saltar a SCHOOL_CONFIRMED sin entrega reportada (committed)", () => {
    const d = authorizeConfirmReceipt(repMirador, publishedNeed, ownCommitment);
    denied(d, "INVALID_TRANSITION");
    assert.match(!d.ok ? d.message : "", /todavía no ha reportado/);
  });
  for (const status of ["confirmed", "cancelled"] as const) {
    it(`no puede confirmar un compromiso ${status}`, () => {
      denied(authorizeConfirmReceipt(repMirador, publishedNeed, { status }), "INVALID_TRANSITION");
    });
  }
  for (const status of NEED_STATUSES.filter((s) => s !== "published")) {
    it(`no puede confirmar si la necesidad está ${status}`, () => {
      denied(authorizeConfirmReceipt(repMirador, { ...publishedNeed, status }, reportedCommitment), "NEED_NOT_OPEN");
    });
  }
});

describe("matriz completa actor × acción (estado válido)", () => {
  // Con el estado correcto, SOLO el actor esperado queda autorizado.
  const expected: Record<string, string[]> = {
    create_need: ["repMirador"],
    validate_need: ["admin"],
    reject_need: ["admin"],
    create_commitment: ["supporter", "otherSupporter"],
    report_delivery: ["supporter"],
    confirm_receipt: ["repMirador"],
  };
  const pending = { schoolId: EL_MIRADOR, status: "pending_validation" as NeedStatus };
  const run: Record<string, (a: Actor) => Decision> = {
    create_need: (a) => authorizeCreateNeed(a, { schoolId: EL_MIRADOR }),
    validate_need: (a) => authorizeValidateNeed(a, pending),
    reject_need: (a) => authorizeRejectNeed(a, pending),
    create_commitment: (a) => authorizeCreateCommitment(a, publishedNeed, 1),
    report_delivery: (a) => authorizeReportDelivery(a, publishedNeed, ownCommitment),
    confirm_receipt: (a) => authorizeConfirmReceipt(a, publishedNeed, reportedCommitment),
  };
  for (const [action, check] of Object.entries(run)) {
    it(`${action}: solo ${expected[action].join(", ")}`, () => {
      const authorized = Object.entries(ALL_ACTORS)
        .filter(([, actor]) => check(actor).ok)
        .map(([name]) => name);
      assert.deepEqual(authorized.sort(), [...expected[action]].sort());
    });
  }
});
