import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeMessageBase64, getTopicMessage, listTopicMessages } from "./mirror";

// Mirror Node simulado: nunca se hace una petición real en estas pruebas.
type Route = (url: string) => Response | Promise<Response>;
function fakeFetch(route: Route) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return route(url);
  }) as typeof fetch;
  return { impl, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const MIRROR = "https://mirror.test";
const RAW = {
  topic_id: "0.0.10796342",
  sequence_number: 1,
  consensus_timestamp: "1790800000.000000001",
  payer_account_id: "0.0.10794781",
  message: Buffer.from('{"a":1}').toString("base64"),
  running_hash: "cnVubmluZw==",
  running_hash_version: 3,
  chunk_info: null,
};

describe("getTopicMessage", () => {
  it("consulta /topics/{id}/messages/{seq} y mapea el mensaje", async () => {
    const { impl, calls } = fakeFetch(() => json(RAW));
    const r = await getTopicMessage({ mirrorUrl: `${MIRROR}/`, topicId: "0.0.10796342", sequenceNumber: 1, fetchImpl: impl });
    assert.deepEqual(calls, [`${MIRROR}/api/v1/topics/0.0.10796342/messages/1`]);
    assert.equal(r.kind, "found");
    assert.deepEqual(r.kind === "found" && r.data, {
      topicId: "0.0.10796342",
      sequenceNumber: 1,
      consensusTimestamp: "1790800000.000000001",
      payerAccountId: "0.0.10794781",
      messageBase64: RAW.message,
      runningHash: RAW.running_hash,
      chunkInfo: null,
    });
  });

  it("404 → not_found (mensaje aún no indexado)", async () => {
    const { impl } = fakeFetch(() => json({ _status: { messages: [{ message: "Not found" }] } }, 404));
    const r = await getTopicMessage({ mirrorUrl: MIRROR, topicId: "0.0.1", sequenceNumber: 1, fetchImpl: impl });
    assert.deepEqual(r, { kind: "not_found" });
  });

  it("5xx → unavailable", async () => {
    const { impl } = fakeFetch(() => json({}, 503));
    const r = await getTopicMessage({ mirrorUrl: MIRROR, topicId: "0.0.1", sequenceNumber: 1, fetchImpl: impl });
    assert.deepEqual(r, { kind: "unavailable", reason: "HTTP 503" });
  });

  it("error de red y timeout → unavailable", async () => {
    const net = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    assert.deepEqual(await getTopicMessage({ mirrorUrl: MIRROR, topicId: "0.0.1", sequenceNumber: 1, fetchImpl: net.impl }), {
      kind: "unavailable",
      reason: "error de red",
    });
    const timeout = fakeFetch(() => {
      throw new DOMException("t", "TimeoutError");
    });
    assert.deepEqual(await getTopicMessage({ mirrorUrl: MIRROR, topicId: "0.0.1", sequenceNumber: 1, fetchImpl: timeout.impl }), {
      kind: "unavailable",
      reason: "timeout",
    });
  });

  it("respuesta con formato inesperado o no JSON → unavailable (datos externos no se confían)", async () => {
    const bad = fakeFetch(() => json({ ...RAW, sequence_number: "uno" }));
    assert.equal((await getTopicMessage({ mirrorUrl: MIRROR, topicId: "0.0.1", sequenceNumber: 1, fetchImpl: bad.impl })).kind, "unavailable");
    const notJson = fakeFetch(() => new Response("<html>", { status: 200 }));
    assert.equal((await getTopicMessage({ mirrorUrl: MIRROR, topicId: "0.0.1", sequenceNumber: 1, fetchImpl: notJson.impl })).kind, "unavailable");
  });

  it("conserva chunk_info (solo number y total) cuando existe", async () => {
    const { impl } = fakeFetch(() => json({ ...RAW, chunk_info: { number: 1, total: 2, initial_transaction_id: {} } }));
    const r = await getTopicMessage({ mirrorUrl: MIRROR, topicId: "0.0.1", sequenceNumber: 1, fetchImpl: impl });
    assert.deepEqual(r.kind === "found" && r.data.chunkInfo, { number: 1, total: 2 });
  });
});

describe("listTopicMessages", () => {
  it("pide orden ascendente desde un timestamp y sigue la paginación", async () => {
    const { impl, calls } = fakeFetch((url) =>
      url.includes("page2")
        ? json({ messages: [{ ...RAW, sequence_number: 2 }], links: { next: null } })
        : json({ messages: [RAW], links: { next: "/api/v1/topics/0.0.1/messages?page2" } }),
    );
    const r = await listTopicMessages({ mirrorUrl: MIRROR, topicId: "0.0.1", fromTimestamp: "1790799995.000000000", fetchImpl: impl });
    assert.equal(r.kind, "found");
    assert.deepEqual(r.kind === "found" && r.data.map((m) => m.sequenceNumber), [1, 2]);
    assert.equal(calls.length, 2);
    const first = new URL(calls[0]);
    assert.equal(first.pathname, "/api/v1/topics/0.0.1/messages");
    assert.equal(first.searchParams.get("order"), "asc");
    assert.equal(first.searchParams.get("timestamp"), "gte:1790799995.000000000");
  });

  it("topic sin mensajes → lista vacía", async () => {
    const { impl } = fakeFetch(() => json({ messages: [], links: { next: null } }));
    const r = await listTopicMessages({ mirrorUrl: MIRROR, topicId: "0.0.1", fetchImpl: impl });
    assert.deepEqual(r, { kind: "found", data: [] });
  });

  it("5xx en cualquier página → unavailable", async () => {
    const { impl } = fakeFetch(() => json({}, 500));
    assert.equal((await listTopicMessages({ mirrorUrl: MIRROR, topicId: "0.0.1", fetchImpl: impl })).kind, "unavailable");
  });
});

describe("decodeMessageBase64", () => {
  it("decodifica bytes UTF-8 y rechaza base64 inválido", () => {
    const bytes = decodeMessageBase64(Buffer.from("Charalá", "utf8").toString("base64"));
    assert.equal(new TextDecoder().decode(bytes!), "Charalá");
    assert.equal(decodeMessageBase64("%%%"), null);
  });
});
