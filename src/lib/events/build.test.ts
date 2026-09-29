import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEvent, InvalidEventError, type BuildEventInput } from "./build";
import { COMMITMENT_EVENT_TYPES, EVENT_ACTOR_ROLE, MAX_HCS_MESSAGE_BYTES, NEED_EVENT_TYPES } from "./types";

const IDS = {
  event: "11111111-1111-4111-8111-111111111111",
  need: "22222222-2222-4222-8222-222222222222",
  school: "00000000-0000-4000-a000-00000000000a", // Escuela El Mirador (DEMO)
  commitment: "33333333-3333-4333-8333-333333333333",
};
const NOW = new Date("2026-10-01T15:00:00.000Z");

const confirmed: BuildEventInput = {
  type: "SCHOOL_CONFIRMED",
  eventId: IDS.event,
  needId: IDS.need,
  schoolId: IDS.school,
  commitmentId: IDS.commitment,
  actorRole: "school_rep",
  now: NOW,
};

// Vector de referencia. Verificado también con una implementación
// independiente (Python: json.dumps(sort_keys=True, separators=(",",":")) + hashlib).
// Si cambia, cambió el formato del evento: eso rompe la verificación de
// eventos ya publicados en Hedera y requiere subir `v`.
const GOLDEN_CANONICAL =
  '{"actorRole":"school_rep","app":"escuela-visible","commitmentId":"33333333-3333-4333-8333-333333333333",' +
  '"eventId":"11111111-1111-4111-8111-111111111111","needId":"22222222-2222-4222-8222-222222222222",' +
  '"schoolId":"00000000-0000-4000-a000-00000000000a","timestamp":"2026-10-01T15:00:00.000Z",' +
  '"type":"SCHOOL_CONFIRMED","v":1}';
const GOLDEN_HASH = "050313358a41cc27b19b52f1a23d28904d675a7ca79625994e962d4d39aedf3e";

describe("buildEvent", () => {
  it("produce exactamente el payload canónico y hash de referencia", () => {
    const event = buildEvent(confirmed);
    assert.equal(event.payloadCanonical, GOLDEN_CANONICAL);
    assert.equal(event.payloadHash, GOLDEN_HASH);
    assert.equal(event.message, `{"hash":"${GOLDEN_HASH}","payload":${GOLDEN_CANONICAL}}`);
  });

  it("contiene únicamente los campos aprobados para HCS", () => {
    const event = buildEvent(confirmed);
    assert.deepEqual(Object.keys(event.payload).sort(), [
      "actorRole",
      "app",
      "commitmentId",
      "eventId",
      "needId",
      "schoolId",
      "timestamp",
      "type",
      "v",
    ]);
    assert.deepEqual(Object.keys(JSON.parse(event.message)).sort(), ["hash", "payload"]);
  });

  it("es determinista con las mismas entradas", () => {
    assert.equal(buildEvent(confirmed).message, buildEvent({ ...confirmed }).message);
  });

  it("cambiar cualquier campo cambia el hash", () => {
    const base = buildEvent(confirmed).payloadHash;
    const variants: Partial<BuildEventInput>[] = [
      { eventId: "44444444-4444-4444-8444-444444444444" },
      { needId: "55555555-5555-4555-8555-555555555555" },
      { schoolId: "00000000-0000-4000-a000-00000000000b" },
      { commitmentId: "66666666-6666-4666-8666-666666666666" },
      { now: new Date(NOW.getTime() + 1) },
    ];
    for (const variant of variants) {
      assert.notEqual(buildEvent({ ...confirmed, ...variant }).payloadHash, base, JSON.stringify(variant));
    }
  });

  it("genera eventId y timestamp si no se inyectan", () => {
    const event = buildEvent({ ...confirmed, eventId: undefined, now: undefined });
    assert.match(event.payload.eventId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.match(event.payload.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.notEqual(event.payload.eventId, buildEvent({ ...confirmed, eventId: undefined }).payload.eventId);
  });

  it("construye los 5 tipos de evento con su rol y cabe en un chunk HCS", () => {
    for (const type of [...NEED_EVENT_TYPES, ...COMMITMENT_EVENT_TYPES]) {
      const isCommitment = (COMMITMENT_EVENT_TYPES as readonly string[]).includes(type);
      const event = buildEvent({
        type,
        needId: IDS.need,
        schoolId: IDS.school,
        commitmentId: isCommitment ? IDS.commitment : null,
        actorRole: EVENT_ACTOR_ROLE[type],
      });
      assert.equal(event.payload.type, type);
      assert.ok(event.messageBytes <= MAX_HCS_MESSAGE_BYTES, `${type}: ${event.messageBytes} bytes`);
      // Margen amplio: el formato actual ocupa ~410 bytes.
      assert.ok(event.messageBytes < 512, `${type}: ${event.messageBytes} bytes`);
    }
  });

  describe("rechaza eventos inválidos", () => {
    const cases: [string, Partial<BuildEventInput>][] = [
      ["id que no es UUID (p. ej. un nombre)", { needId: "Juan Pérez" }],
      ["UUID en mayúsculas", { schoolId: IDS.school.toUpperCase() }], // ...00A
      ["tipo desconocido", { type: "NEED_REJECTED" as BuildEventInput["type"] }],
      ["rol desconocido", { actorRole: "guest" as BuildEventInput["actorRole"] }],
      ["rol que no corresponde al tipo (supporter confirmando)", { actorRole: "supporter" }],
      ["rol que no corresponde al tipo (admin confirmando)", { actorRole: "admin" }],
      ["evento de compromiso sin commitmentId", { commitmentId: null }],
      ["fecha inválida", { now: new Date("fecha inválida") }],
    ];
    for (const [label, override] of cases) {
      it(label, () => {
        assert.throws(() => buildEvent({ ...confirmed, ...override }), InvalidEventError);
      });
    }

    it("evento de necesidad con commitmentId", () => {
      assert.throws(
        () =>
          buildEvent({
            type: "NEED_CREATED",
            needId: IDS.need,
            schoolId: IDS.school,
            commitmentId: IDS.commitment,
            actorRole: "school_rep",
          }),
        InvalidEventError,
      );
    });

    it("no acepta campos extra aunque se cuelen en la entrada (título, nota, nombre)", () => {
      const withExtras = {
        ...confirmed,
        title: "Kits escolares",
        note: "Entregado a la profesora",
        name: "Juan Pérez",
      } as BuildEventInput;
      const event = buildEvent(withExtras);
      const text = event.message;
      for (const forbidden of ["Kits escolares", "Entregado", "Juan", "title", "note", "name"]) {
        assert.ok(!text.includes(forbidden), `el mensaje no debe contener "${forbidden}"`);
      }
    });
  });
});
