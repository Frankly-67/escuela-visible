import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEvent } from "./build";
import { canonicalize } from "./canonical";
import { sha256Hex } from "./hash";
import { HcsMessageTooLargeError, parseHcsMessage, serializeHcsMessage } from "./message";
import { MAX_HCS_MESSAGE_BYTES, type EventPayloadV1 } from "./types";

const event = buildEvent({
  type: "DELIVERY_REPORTED",
  eventId: "11111111-1111-4111-8111-111111111111",
  needId: "22222222-2222-4222-8222-222222222222",
  schoolId: "00000000-0000-4000-a000-00000000000b",
  commitmentId: "33333333-3333-4333-8333-333333333333",
  actorRole: "supporter",
  now: new Date("2026-10-02T09:30:00.000Z"),
});

function ok(result: ReturnType<typeof parseHcsMessage>) {
  assert.ok(result.ok, result.ok ? "" : result.reason);
  return result;
}

describe("parseHcsMessage", () => {
  it("interpreta un mensaje propio: hash coincide y forma canónica", () => {
    const parsed = ok(parseHcsMessage(event.message));
    assert.equal(parsed.hashMatches, true);
    assert.equal(parsed.isCanonical, true);
    assert.equal(parsed.recomputedHash, event.payloadHash);
    assert.equal(parsed.payloadCanonical, event.payloadCanonical);
    assert.deepEqual(parsed.message.payload, event.payload);
  });

  it("acepta los bytes UTF-8 tal como llegan del Mirror Node (base64 decodificado)", () => {
    const base64 = Buffer.from(event.message, "utf8").toString("base64");
    const bytes = new Uint8Array(Buffer.from(base64, "base64"));
    const parsed = ok(parseHcsMessage(bytes));
    assert.equal(parsed.hashMatches, true);
  });

  it("detecta un payload alterado (el hash declarado ya no coincide)", () => {
    const tampered = JSON.parse(event.message) as { hash: string; payload: EventPayloadV1 };
    tampered.payload.timestamp = "2026-10-02T09:30:00.001Z";
    const parsed = ok(parseHcsMessage(canonicalize(tampered)));
    assert.equal(parsed.hashMatches, false);
    assert.notEqual(parsed.recomputedHash, event.payloadHash);
  });

  it("detecta un hash alterado", () => {
    const tampered = event.message.replace(event.payloadHash, sha256Hex("otra cosa"));
    const parsed = ok(parseHcsMessage(tampered));
    assert.equal(parsed.hashMatches, false);
  });

  it("marca como no canónico un mensaje válido pero con otro formato", () => {
    const pretty = JSON.stringify(JSON.parse(event.message), null, 2);
    const parsed = ok(parseHcsMessage(pretty));
    assert.equal(parsed.hashMatches, true);
    assert.equal(parsed.isCanonical, false);
  });

  it("rechaza mensajes que no son de Escuela Visible, sin lanzar", () => {
    const cases: [string, string | Uint8Array][] = [
      ["no JSON", "hola"],
      ["UTF-8 inválido", new Uint8Array([0xff, 0xfe, 0xfd])],
      ["sin hash", JSON.stringify({ payload: event.payload })],
      ["hash con formato inválido", JSON.stringify({ hash: "ABC", payload: event.payload })],
      ["campo extra en el payload", JSON.stringify({ hash: event.payloadHash, payload: { ...event.payload, title: "x" } })],
      ["campo extra en el mensaje", JSON.stringify({ hash: event.payloadHash, payload: event.payload, note: "x" })],
      ["otra app", JSON.stringify({ hash: event.payloadHash, payload: { ...event.payload, app: "otra" } })],
      ["otra versión", JSON.stringify({ hash: event.payloadHash, payload: { ...event.payload, v: 2 } })],
    ];
    for (const [label, raw] of cases) {
      const result = parseHcsMessage(raw);
      assert.equal(result.ok, false, label);
    }
  });
});

describe("serializeHcsMessage", () => {
  it("serializa en forma canónica con las claves hash y payload", () => {
    const text = serializeHcsMessage(event.payload, event.payloadHash);
    assert.equal(text, event.message);
    assert.ok(text.startsWith('{"hash":"'));
  });

  it("lanza si el mensaje supera un chunk HCS", () => {
    const huge = { ...event.payload, needId: "x".repeat(MAX_HCS_MESSAGE_BYTES) };
    assert.throws(() => serializeHcsMessage(huge, event.payloadHash), HcsMessageTooLargeError);
  });
});
