import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBoardPostForm } from "@/lib/actions/board-result";

import { createBoardPostInputSchema } from "./schemas";

const SCHOOL = "00000000-0000-4000-a000-00000000000a";
const valid = { schoolId: SCHOOL, kind: "bazar", title: "Bazar de la escuela", body: "Habrá juegos.", eventDate: "2026-10-15" };
const messages = (input: unknown) => {
  const r = createBoardPostInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("createBoardPostInputSchema", () => {
  it("acepta una publicación válida y recorta espacios", () => {
    const r = createBoardPostInputSchema.parse({ ...valid, title: "  Bazar de la escuela  " });
    assert.equal(r.title, "Bazar de la escuela");
  });

  it("texto y fecha opcionales", () => {
    const r = createBoardPostInputSchema.parse({ schoolId: SCHOOL, kind: "campana", title: "Campaña de lectura" });
    assert.equal(r.body, "");
    assert.equal(r.eventDate, null);
  });

  it("límites de la base de datos: título 3–120, texto ≤ 2000", () => {
    assert.deepEqual(messages({ ...valid, title: "ab" }), ["El título es muy corto"]);
    assert.deepEqual(messages({ ...valid, title: "x".repeat(121) }), ["El título es muy largo"]);
    assert.deepEqual(messages({ ...valid, body: "x".repeat(2001) }), ["El texto es muy largo"]);
  });

  it("tipo y fecha válidos", () => {
    assert.deepEqual(messages({ ...valid, kind: "rifa" }), ["Elige un tipo de publicación."]);
    assert.deepEqual(messages({ ...valid, eventDate: "15/10/2026" }), ["La fecha no es válida."]);
  });

  it("bloquea teléfonos y correos en el título y en el texto", () => {
    assert.match(messages({ ...valid, title: "Informes 300 123 4567" })[0], /teléfono/);
    assert.match(messages({ ...valid, body: "Escribir a rectoria@escuela.edu.co" })[0], /correos/);
  });

  it("no admite campos extra (sin imágenes, precios, contactos ni necesidades)", () => {
    for (const extra of [{ imageUrl: "x" }, { price: 1000 }, { needId: SCHOOL }, { status: "published" }, { createdBy: SCHOOL }]) {
      assert.equal(createBoardPostInputSchema.safeParse({ ...valid, ...extra }).success, false, JSON.stringify(extra));
    }
  });
});

describe("parseBoardPostForm", () => {
  const form = (fields: Record<string, string>) => ({ get: (name: string) => fields[name] ?? null });

  it("solo toma tipo, título, texto y fecha (ignora escuela, rol y usuario)", () => {
    const { input } = parseBoardPostForm(
      form({ kind: "sancocho", title: "Sancocho", body: "", eventDate: " 2026-11-01 ", schoolId: SCHOOL, role: "admin", userId: "u" }),
    );
    assert.deepEqual(input, { kind: "sancocho", title: "Sancocho", body: "", eventDate: "2026-11-01" });
  });

  it("fecha vacía → null", () => {
    assert.equal(parseBoardPostForm(form({ kind: "bazar", title: "Bazar", eventDate: "" })).input.eventDate, null);
  });
});
