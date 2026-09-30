import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hashscanTopicUrl, hashscanTransactionUrl, toMirrorTransactionId, transactionValidStartSeconds } from "./links";

describe("links", () => {
  it("enlaces de HashScan", () => {
    assert.equal(hashscanTopicUrl("testnet", "0.0.10796342"), "https://hashscan.io/testnet/topic/0.0.10796342");
    assert.equal(
      hashscanTransactionUrl("testnet", "1790794162.464827104"),
      "https://hashscan.io/testnet/transaction/1790794162.464827104",
    );
  });

  it("convierte el TransactionId del SDK al formato del Mirror Node (nanos con 9 dígitos)", () => {
    assert.equal(toMirrorTransactionId("0.0.10794781@1790794154.870465996"), "0.0.10794781-1790794154-870465996");
    assert.equal(toMirrorTransactionId("0.0.10794781@1790794154.5"), "0.0.10794781-1790794154-000000005");
    assert.throws(() => toMirrorTransactionId("0.0.1-1-1"));
  });

  it("extrae los segundos del validStart", () => {
    assert.equal(transactionValidStartSeconds("0.0.10794781@1790794154.870465996"), 1790794154);
    assert.throws(() => transactionValidStartSeconds("basura"));
  });
});
