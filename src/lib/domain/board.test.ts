import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authorizeCreatePost,
  authorizeReviewPost,
  BOARD_KIND_LABEL,
  BOARD_POST_KINDS,
  BOARD_POST_STATUSES,
  canTransitionPost,
  parseBoardKindFilter,
} from "./board";
import type { Actor } from "./permissions";

const SCHOOL = "00000000-0000-4000-a000-00000000000a";
const OTHER = "00000000-0000-4000-a000-00000000000b";
const rep: Actor = { id: "r", role: "school_rep", schoolId: SCHOOL };
const admin: Actor = { id: "a", role: "admin", schoolId: null };
const supporter: Actor = { id: "s", role: "supporter", schoolId: null };

describe("tipos y estados del tablón", () => {
  it("los 7 tipos aprobados, cada uno con etiqueta", () => {
    assert.deepEqual(
      [...BOARD_POST_KINDS],
      ["bazar", "sancocho", "actividad", "mejora_infraestructura", "materiales_escolares", "campana", "proyecto_terminado"],
    );
    for (const k of BOARD_POST_KINDS) assert.ok(BOARD_KIND_LABEL[k]);
  });

  it("solo 3 estados", () => {
    assert.deepEqual([...BOARD_POST_STATUSES], ["pending_review", "published", "rejected"]);
  });
});

describe("transiciones", () => {
  it("pending_review → published | rejected; nada más", () => {
    for (const from of BOARD_POST_STATUSES) {
      for (const to of BOARD_POST_STATUSES) {
        const expected = from === "pending_review" && (to === "published" || to === "rejected");
        assert.equal(canTransitionPost(from, to), expected, `${from} → ${to}`);
      }
    }
  });
});

describe("authorizeCreatePost", () => {
  it("el representante de esa escuela puede publicar", () => {
    assert.deepEqual(authorizeCreatePost(rep, { schoolId: SCHOOL }), { ok: true });
  });
  it("no para otra escuela", () => {
    const d = authorizeCreatePost(rep, { schoolId: OTHER });
    assert.equal(d.ok, false);
    assert.equal(!d.ok && d.code, "NOT_SCHOOL_MEMBER");
  });
  it("ni aliados ni admin publican (no hay publicaciones anónimas ni de terceros)", () => {
    for (const actor of [supporter, admin]) {
      const d = authorizeCreatePost(actor, { schoolId: SCHOOL });
      assert.equal(!d.ok && d.code, "FORBIDDEN_ROLE");
    }
  });
  it("un school_rep sin escuela no puede publicar", () => {
    const d = authorizeCreatePost({ ...rep, schoolId: null }, { schoolId: SCHOOL });
    assert.equal(!d.ok && d.code, "NOT_SCHOOL_MEMBER");
  });
});

describe("authorizeReviewPost", () => {
  it("admin aprueba o no aprueba una pendiente", () => {
    assert.deepEqual(authorizeReviewPost(admin, { status: "pending_review" }, "published"), { ok: true });
    assert.deepEqual(authorizeReviewPost(admin, { status: "pending_review" }, "rejected"), { ok: true });
  });
  it("una ya revisada no se vuelve a revisar", () => {
    for (const status of ["published", "rejected"] as const) {
      for (const to of ["published", "rejected"] as const) {
        const d = authorizeReviewPost(admin, { status }, to);
        assert.equal(!d.ok && d.code, "INVALID_TRANSITION", `${status} → ${to}`);
      }
    }
  });
  it("solo admin", () => {
    for (const actor of [rep, supporter]) {
      const d = authorizeReviewPost(actor, { status: "pending_review" }, "published");
      assert.equal(!d.ok && d.code, "FORBIDDEN_ROLE");
    }
  });
});

describe("parseBoardKindFilter", () => {
  it("sin valor → todos", () => {
    assert.deepEqual(parseBoardKindFilter(undefined), { ok: true, kind: null });
  });
  it("un tipo válido", () => {
    assert.deepEqual(parseBoardKindFilter("bazar"), { ok: true, kind: "bazar" });
  });
  it("valores inválidos", () => {
    for (const v of ["", "BAZAR", "otro", "'; drop", ["bazar", "sancocho"]]) {
      assert.deepEqual(parseBoardKindFilter(v), { ok: false }, JSON.stringify(v));
    }
  });
});
