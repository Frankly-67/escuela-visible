import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEvent } from "@/lib/events/build";
import { canonicalize } from "@/lib/events/canonical";
import { sha256Hex } from "@/lib/events/hash";

import type { MirrorTopicMessage } from "./mirror";
import {
  canResubmit,
  findEventMessage,
  OutboxIntegrityError,
  RESUBMIT_AFTER_SECONDS,
  rebuildHcsMessage,
  toHederaTimestamp,
} from "./outbox";

const built = buildEvent({
  type: "NEED_CREATED",
  eventId: "11111111-1111-4111-8111-111111111111",
  needId: "22222222-2222-4222-8222-222222222222",
  schoolId: "00000000-0000-4000-a000-00000000000a",
  actorRole: "school_rep",
  now: new Date("2026-10-01T15:00:00.000Z"),
});
const row = { id: built.payload.eventId, payloadCanonical: built.payloadCanonical, payloadHash: built.payloadHash };

describe("rebuildHcsMessage", () => {
  it("reconstruye exactamente el mensaje a partir de lo guardado", () => {
    assert.equal(rebuildHcsMessage(row), built.message);
  });

  it("se niega a publicar una fila no íntegra", () => {
    const pretty = JSON.stringify(built.payload, null, 2);
    const cases = [
      { ...row, payloadHash: sha256Hex("otra cosa") }, // hash no corresponde
      { ...row, payloadCanonical: pretty, payloadHash: sha256Hex(pretty) }, // no canónico
      { ...row, id: "44444444-4444-4444-8444-444444444444" }, // eventId ≠ id de la fila
      (() => {
        const extra = canonicalize({ ...built.payload, note: "x" });
        return { ...row, payloadCanonical: extra, payloadHash: sha256Hex(extra) }; // campo extra
      })(),
      { ...row, payloadCanonical: "no-json", payloadHash: sha256Hex("no-json") },
    ];
    for (const bad of cases) assert.throws(() => rebuildHcsMessage(bad), OutboxIntegrityError);
  });
});

describe("canResubmit", () => {
  const txId = "0.0.10794781@1790794154.870465996";
  it("no reenvía mientras la transacción anterior aún puede llegar a consenso", () => {
    assert.equal(canResubmit(txId, 1790794154 + 30), false);
    assert.equal(canResubmit(txId, 1790794154 + RESUBMIT_AFTER_SECONDS), false);
  });
  it("reenvía pasada la ventana de validez", () => {
    assert.equal(canResubmit(txId, 1790794154 + RESUBMIT_AFTER_SECONDS + 1), true);
  });
});

describe("findEventMessage", () => {
  const msg = (text: string, sequenceNumber: number): MirrorTopicMessage => ({
    topicId: "0.0.10796342",
    sequenceNumber,
    consensusTimestamp: `1790800000.00000000${sequenceNumber}`,
    payerAccountId: "0.0.10794781",
    messageBase64: Buffer.from(text, "utf8").toString("base64"),
    runningHash: "x",
    chunkInfo: null,
  });
  const other = buildEvent({ ...built.payload, eventId: "44444444-4444-4444-8444-444444444444", now: new Date() });
  const tampered = canonicalize({ hash: built.payloadHash, payload: { ...built.payload, timestamp: "2026-10-01T15:00:00.001Z" } });

  it("encuentra el mensaje del evento por contenido, entre otros", () => {
    const found = findEventMessage([msg("ajeno", 1), msg(other.message, 2), msg(built.message, 3)], built.payload.eventId);
    assert.equal(found?.sequenceNumber, 3);
  });

  it("ignora mensajes ajenos o alterados", () => {
    assert.equal(findEventMessage([msg("ajeno", 1), msg(tampered, 2), msg(other.message, 3)], built.payload.eventId), null);
  });
});

describe("toHederaTimestamp", () => {
  it("convierte ISO a segundos.nanos con margen hacia atrás", () => {
    assert.equal(toHederaTimestamp("2026-10-01T15:00:00.000Z"), "1790866800.000000000");
    assert.equal(toHederaTimestamp("2026-10-01T15:00:00.000Z", 5), "1790866795.000000000");
  });
});
