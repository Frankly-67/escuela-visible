import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEvent } from "@/lib/events/build";
import { canonicalize } from "@/lib/events/canonical";
import { sha256Hex } from "@/lib/events/hash";
import type { MirrorResult, MirrorTopicMessage } from "@/lib/hedera/mirror";

import { CHECKS, verifyEvent, type LocalEvent, type MismatchCode } from "./verify-event";

// Fixtures SOLO en memoria (nunca se publican ni se guardan).
const TOPIC = "0.0.10796342";
const OPERATOR = "0.0.10794781";
const CONFIG = { expectedTopicId: TOPIC, operatorAccountId: OPERATOR };
const SCHOOL = "00000000-0000-4000-a000-00000000000a";
const NEED = "22222222-2222-4222-8222-222222222222";

const built = buildEvent({
  type: "NEED_CREATED",
  eventId: "11111111-1111-4111-8111-111111111111",
  needId: NEED,
  schoolId: SCHOOL,
  actorRole: "school_rep",
  now: new Date("2026-10-01T15:00:00.000Z"),
});

const local = (overrides: Partial<LocalEvent> = {}): LocalEvent => ({
  id: built.payload.eventId,
  eventType: "NEED_CREATED",
  needId: NEED,
  schoolId: SCHOOL,
  commitmentId: null,
  actorRole: "school_rep",
  payloadCanonical: built.payloadCanonical,
  payloadHash: built.payloadHash,
  submissionStatus: "submitted",
  topicId: TOPIC,
  sequenceNumber: 1,
  consensusTimestamp: null,
  ...overrides,
});

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

const remote = (overrides: Partial<MirrorTopicMessage> = {}, text = built.message): MirrorResult<MirrorTopicMessage> => ({
  kind: "found",
  data: {
    topicId: TOPIC,
    sequenceNumber: 1,
    consensusTimestamp: "1790800000.000000001",
    payerAccountId: OPERATOR,
    messageBase64: b64(text),
    runningHash: "cnVubmluZw==",
    chunkInfo: null,
    ...overrides,
  },
});

function expectMismatch(result: ReturnType<typeof verifyEvent>, expected: MismatchCode[]) {
  assert.equal(result.status, "MISMATCH");
  assert.deepEqual([...result.mismatches].sort(), [...expected].sort());
}

describe("verifyEvent — VERIFIED", () => {
  it("todas las comprobaciones pasan cuando local y Hedera coinciden byte a byte", () => {
    const result = verifyEvent(local(), remote(), CONFIG);
    assert.equal(result.status, "VERIFIED");
    assert.deepEqual(result.mismatches, []);
    assert.equal(result.checks.length, 13);
    assert.ok(result.checks.every((c) => c.outcome === "pass"));
    assert.deepEqual(result.remote, {
      topicId: TOPIC,
      sequenceNumber: 1,
      consensusTimestamp: "1790800000.000000001",
      payerAccountId: OPERATOR,
      hash: built.payloadHash,
    });
  });

  it("sigue VERIFIED si la marca de consenso guardada coincide", () => {
    assert.equal(verifyEvent(local({ consensusTimestamp: "1790800000.000000001" }), remote(), CONFIG).status, "VERIFIED");
  });

  it("acepta chunk_info de una sola parte", () => {
    assert.equal(verifyEvent(local(), remote({ chunkInfo: { number: 1, total: 1 } }), CONFIG).status, "VERIFIED");
  });

  it("expone las 13 comprobaciones en orden, con los códigos definidos", () => {
    const result = verifyEvent(local(), remote(), CONFIG);
    assert.deepEqual(result.checks.map((c) => c.step), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    assert.deepEqual(result.checks.map((c) => c.code), CHECKS.map((c) => c.code));
  });
});

describe("verifyEvent — estados sin comparación remota", () => {
  it("PENDING: registrado pero no publicado", () => {
    const r = verifyEvent(local({ submissionStatus: "pending", topicId: null, sequenceNumber: null }), null, CONFIG);
    assert.equal(r.status, "PENDING");
    assert.equal(r.remote, null);
  });

  it("PUBLISH_FAILED: la publicación falló", () => {
    assert.equal(verifyEvent(local({ submissionStatus: "failed", sequenceNumber: null }), null, CONFIG).status, "PUBLISH_FAILED");
  });

  it("AWAITING_MIRROR: publicado, el Mirror Node aún responde 404", () => {
    assert.equal(verifyEvent(local(), { kind: "not_found" }, CONFIG).status, "AWAITING_MIRROR");
  });

  it("UNAVAILABLE: el Mirror Node no responde (no es un mismatch)", () => {
    const r = verifyEvent(local(), { kind: "unavailable", reason: "timeout" }, CONFIG);
    assert.equal(r.status, "UNAVAILABLE");
    assert.equal(r.unavailableReason, "timeout");
    assert.deepEqual(r.mismatches, []);
  });

  it("una alteración LOCAL tiene prioridad: MISMATCH aunque esté pendiente o Hedera no responda", () => {
    const tampered = { payloadHash: sha256Hex("otra cosa") };
    expectMismatch(verifyEvent(local({ ...tampered, submissionStatus: "pending" }), null, CONFIG), ["LOCAL_HASH_INVALID"]);
    expectMismatch(verifyEvent(local(tampered), { kind: "unavailable", reason: "x" }, CONFIG), ["LOCAL_HASH_INVALID"]);
  });
});

describe("verifyEvent — cada código de MISMATCH", () => {
  it("1 LOCAL_HASH_INVALID: el hash guardado no corresponde al contenido guardado", () => {
    const r = verifyEvent(local({ payloadHash: sha256Hex("otra cosa") }), remote(), CONFIG);
    // Se compara igualmente con Hedera: el hash publicado difiere del alterado,
    // y el mensaje en Hedera sigue siendo íntegro (9 pasa).
    expectMismatch(r, ["LOCAL_HASH_INVALID", "HASH_MISMATCH"]);
    assert.equal(r.checks.find((c) => c.code === "MESSAGE_HASH_INVALID")?.outcome, "pass");
  });

  it("2 LOCAL_PAYLOAD_INCONSISTENT: la fila dice otra necesidad que el payload", () => {
    expectMismatch(verifyEvent(local({ needId: "33333333-3333-4333-8333-333333333333" }), remote(), CONFIG), [
      "LOCAL_PAYLOAD_INCONSISTENT",
    ]);
  });

  it("2 LOCAL_PAYLOAD_INCONSISTENT: payload guardado no canónico o con campos extra", () => {
    const pretty = JSON.stringify(built.payload, null, 2);
    const r1 = verifyEvent(local({ payloadCanonical: pretty, payloadHash: sha256Hex(pretty) }), remote(), CONFIG);
    assert.ok(r1.mismatches.includes("LOCAL_PAYLOAD_INCONSISTENT"));
    const extra = canonicalize({ ...built.payload, title: "Kits" });
    const r2 = verifyEvent(local({ payloadCanonical: extra, payloadHash: sha256Hex(extra) }), remote(), CONFIG);
    assert.ok(r2.mismatches.includes("LOCAL_PAYLOAD_INCONSISTENT"));
  });

  it("alguien edita el payload en Supabase y recalcula el hash: lo detecta Hedera (10, 11)", () => {
    const edited = canonicalize({ ...built.payload, timestamp: "2026-10-01T15:00:00.001Z" });
    const r = verifyEvent(local({ payloadCanonical: edited, payloadHash: sha256Hex(edited) }), remote(), CONFIG);
    expectMismatch(r, ["HASH_MISMATCH", "PAYLOAD_MISMATCH"]);
  });

  it("3 TOPIC_MISMATCH: mensaje en otro topic", () => {
    expectMismatch(verifyEvent(local(), remote({ topicId: "0.0.999" }), CONFIG), ["TOPIC_MISMATCH"]);
  });

  it("3 TOPIC_MISMATCH: la fila apunta a otro topic (sin consultar Hedera)", () => {
    const r = verifyEvent(local({ topicId: "0.0.999" }), null, CONFIG);
    expectMismatch(r, ["TOPIC_MISMATCH"]);
  });

  it("4 SEQUENCE_MISMATCH: el Mirror Node devuelve otra posición", () => {
    expectMismatch(verifyEvent(local(), remote({ sequenceNumber: 2 }), CONFIG), ["SEQUENCE_MISMATCH"]);
  });

  it("4 SEQUENCE_MISMATCH: figura como publicado pero sin posición", () => {
    expectMismatch(verifyEvent(local({ sequenceNumber: null }), null, CONFIG), ["SEQUENCE_MISMATCH"]);
  });

  it("5 PAYER_MISMATCH: publicado por otra cuenta", () => {
    expectMismatch(verifyEvent(local(), remote({ payerAccountId: "0.0.12345" }), CONFIG), ["PAYER_MISMATCH"]);
  });

  it("6 CHUNKED_MESSAGE: mensaje fragmentado", () => {
    expectMismatch(verifyEvent(local(), remote({ chunkInfo: { number: 1, total: 2 } }), CONFIG), ["CHUNKED_MESSAGE"]);
  });

  it("7 MESSAGE_UNREADABLE: mensaje ajeno; 8–12 quedan omitidas", () => {
    const r = verifyEvent(local(), remote({}, "hola"), CONFIG);
    expectMismatch(r, ["MESSAGE_UNREADABLE"]);
    const skipped = r.checks.filter((c) => c.outcome === "skipped").map((c) => c.step);
    assert.deepEqual(skipped, [8, 9, 10, 11, 12]);
  });

  it("7 MESSAGE_UNREADABLE: base64 inválido", () => {
    const r = verifyEvent(local(), remote({ messageBase64: "%%%" }), CONFIG);
    expectMismatch(r, ["MESSAGE_UNREADABLE"]);
  });

  it("8 MESSAGE_NOT_CANONICAL: mismo contenido con otro formato", () => {
    const pretty = JSON.stringify(JSON.parse(built.message), null, 2);
    expectMismatch(verifyEvent(local(), remote({}, pretty), CONFIG), ["MESSAGE_NOT_CANONICAL"]);
  });

  it("9 MESSAGE_HASH_INVALID: payload publicado alterado con el hash original", () => {
    const tampered = canonicalize({
      hash: built.payloadHash,
      payload: { ...built.payload, timestamp: "2026-10-01T15:00:00.001Z" },
    });
    expectMismatch(verifyEvent(local(), remote({}, tampered), CONFIG), ["MESSAGE_HASH_INVALID", "PAYLOAD_MISMATCH"]);
  });

  it("10/11/12 HASH, PAYLOAD y EVENT_ID: la posición contiene OTRO evento", () => {
    const other = buildEvent({
      type: "NEED_CREATED",
      eventId: "44444444-4444-4444-8444-444444444444",
      needId: NEED,
      schoolId: SCHOOL,
      actorRole: "school_rep",
      now: new Date("2026-10-01T15:00:00.000Z"),
    });
    expectMismatch(verifyEvent(local(), remote({}, other.message), CONFIG), [
      "HASH_MISMATCH",
      "PAYLOAD_MISMATCH",
      "EVENT_ID_MISMATCH",
    ]);
  });

  it("13 TIMESTAMP_MISMATCH: la marca de consenso guardada difiere", () => {
    expectMismatch(verifyEvent(local({ consensusTimestamp: "1790800000.000000002" }), remote(), CONFIG), [
      "TIMESTAMP_MISMATCH",
    ]);
  });

  it("reporta TODOS los motivos a la vez", () => {
    const r = verifyEvent(local(), remote({ topicId: "0.0.999", payerAccountId: "0.0.1", sequenceNumber: 9 }), CONFIG);
    expectMismatch(r, ["TOPIC_MISMATCH", "PAYER_MISMATCH", "SEQUENCE_MISMATCH"]);
  });

  it("hay exactamente 13 comprobaciones definidas (si se agrega una, hay que probarla aquí)", () => {
    assert.equal(CHECKS.length, 13);
  });
});
